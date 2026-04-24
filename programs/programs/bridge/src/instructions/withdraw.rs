use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    ed25519_program,
    instruction::Instruction,
    sysvar::instructions::{self as ix_sysvar, load_instruction_at_checked},
};
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::{Config, PlayerVault, WithdrawVoucher};
use crate::events::WithdrawEvent;
use crate::errors::BridgeError;

#[derive(Accounts)]
#[instruction(voucher: WithdrawVoucher)]
pub struct Withdraw<'info> {
    /// The wallet redeeming the voucher — must match voucher.user.
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"config"],
        bump,
    )]
    pub config: Account<'info, Config>,

    #[account(
        init_if_needed,
        payer = user,
        space = PlayerVault::LEN,
        seeds = [b"vault", user.key().as_ref()],
        bump,
    )]
    pub player_vault: Account<'info, PlayerVault>,

    /// Treasury ATA — tokens are sent from here to the user.
    #[account(
        mut,
        constraint = treasury_ata.key() == config.treasury_ata,
    )]
    pub treasury_ata: Account<'info, TokenAccount>,

    /// User's $GRIND ATA — receives the payout.
    #[account(
        mut,
        constraint = user_ata.owner == user.key(),
        constraint = user_ata.mint == config.grind_mint,
    )]
    pub user_ata: Account<'info, TokenAccount>,

    /// The treasury PDA whose key is the authority over treasury_ata.
    /// CHECK: verified by seeds + bump in CPI signer seeds.
    #[account(
        seeds = [b"treasury"],
        bump = config.treasury_bump,
    )]
    pub treasury_pda: UncheckedAccount<'info>,

    /// Instructions sysvar — used to read the preceding Ed25519 instruction.
    /// CHECK: this is the well-known sysvar address.
    #[account(address = ix_sysvar::ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

/// Build the 56-byte canonical message that the game server signs.
/// Layout: user (32) || amount (u64 le) || nonce (u64 le) || expiry (i64 le)
pub fn voucher_message(voucher: &WithdrawVoucher) -> [u8; 56] {
    let mut msg = [0u8; 56];
    msg[..32].copy_from_slice(voucher.user.as_ref());
    msg[32..40].copy_from_slice(&voucher.amount.to_le_bytes());
    msg[40..48].copy_from_slice(&voucher.nonce.to_le_bytes());
    msg[48..56].copy_from_slice(&voucher.expiry.to_le_bytes());
    msg
}

pub fn handler(ctx: Context<Withdraw>, voucher: WithdrawVoucher) -> Result<()> {
    // ── 1. User must match voucher ────────────────────────────────────────────
    require!(ctx.accounts.user.key() == voucher.user, BridgeError::UserMismatch);

    // ── 2. Nonce must be strictly increasing ─────────────────────────────────
    let vault = &ctx.accounts.player_vault;
    require!(voucher.nonce > vault.nonce, BridgeError::NonceTooLow);

    // ── 3. Voucher must not be expired ────────────────────────────────────────
    let clock = Clock::get()?;
    require!(voucher.expiry > clock.unix_timestamp, BridgeError::VoucherExpired);

    // ── 4. Per-epoch cap ──────────────────────────────────────────────────────
    let config = &ctx.accounts.config;
    require!(
        config.epoch_withdraw_used.saturating_add(voucher.amount) <= config.max_withdraw_per_epoch,
        BridgeError::EpochCapExceeded,
    );

    // ── 5. Verify ed25519 signature via preceding instruction ─────────────────
    verify_ed25519_ix(
        &ctx.accounts.instructions_sysvar,
        &config.game_signer,
        &voucher_message(&voucher),
        &voucher.signature,
    )?;

    // ── 6. Transfer treasury → user ───────────────────────────────────────────
    let treasury_bump = config.treasury_bump;
    let seeds: &[&[u8]] = &[b"treasury", &[treasury_bump]];
    let signer_seeds = &[seeds];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.treasury_ata.to_account_info(),
                to: ctx.accounts.user_ata.to_account_info(),
                authority: ctx.accounts.treasury_pda.to_account_info(),
            },
            signer_seeds,
        ),
        voucher.amount,
    )?;

    // ── 7. Update state ───────────────────────────────────────────────────────
    let vault = &mut ctx.accounts.player_vault;
    vault.user = ctx.accounts.user.key();
    vault.nonce = voucher.nonce;

    let config = &mut ctx.accounts.config;
    config.epoch_withdraw_used = config.epoch_withdraw_used.saturating_add(voucher.amount);

    emit!(WithdrawEvent {
        user: ctx.accounts.user.key(),
        amount: voucher.amount,
        nonce: voucher.nonce,
    });

    Ok(())
}

/// Validate that the instruction immediately before this one in the transaction
/// is an Ed25519Program instruction that verifies `signature` over `message`
/// with `expected_pubkey`.
///
/// Layout of Ed25519Program instruction data (all little-endian):
///   [0..2]   num_signatures (u16)
///   [2..14]  padding
///   [14..16] signature_offset (u16) — offset of sig within instruction data
///   [16..18] signature_instruction_index (u16)
///   [18..20] public_key_offset (u16)
///   [20..22] public_key_instruction_index (u16)
///   [22..24] message_data_offset (u16)
///   [24..26] message_data_size (u16)
///   [26..28] message_instruction_index (u16)
///   [28..]   signature (64) | pubkey (32) | message (n)
///
/// We re-derive the expected offsets and compare in-data values directly.
fn verify_ed25519_ix(
    instructions_sysvar: &UncheckedAccount,
    expected_pubkey: &Pubkey,
    message: &[u8],
    expected_sig: &[u8; 64],
) -> Result<()> {
    // The ed25519 instruction must be at index current_index - 1.
    let current_index = ix_sysvar::load_current_index_checked(instructions_sysvar)?;
    require!(current_index > 0, BridgeError::MissingEd25519Instruction);

    let ed25519_ix: Instruction =
        load_instruction_at_checked((current_index - 1) as usize, instructions_sysvar)
            .map_err(|_| BridgeError::MissingEd25519Instruction)?;

    require!(
        ed25519_ix.program_id == ed25519_program::ID,
        BridgeError::MissingEd25519Instruction,
    );

    let data = &ed25519_ix.data;
    // Minimum header size: 2 (count) + 14 (padding+offsets per sig header) = 14 bytes header
    // Per Solana docs each signature header is 14 bytes after the 2-byte count.
    require!(data.len() >= 2, BridgeError::MalformedEd25519Data);

    let num_sigs = u16::from_le_bytes([data[0], data[1]]);
    require!(num_sigs >= 1, BridgeError::MalformedEd25519Data);

    // First signature header starts at offset 2. SignatureOffsets layout:
    //   [2..4]   signature_offset
    //   [4..6]   signature_instruction_index
    //   [6..8]   public_key_offset
    //   [8..10]  public_key_instruction_index
    //   [10..12] message_data_offset
    //   [12..14] message_data_size
    //   [14..16] message_instruction_index
    require!(data.len() >= 16, BridgeError::MalformedEd25519Data);
    let sig_offset    = u16::from_le_bytes([data[2],  data[3]])  as usize;
    let pubkey_offset = u16::from_le_bytes([data[6],  data[7]])  as usize;
    let msg_offset    = u16::from_le_bytes([data[10], data[11]]) as usize;
    let msg_size      = u16::from_le_bytes([data[12], data[13]]) as usize;

    // Validate bounds.
    require!(
        data.len() >= sig_offset + 64
            && data.len() >= pubkey_offset + 32
            && data.len() >= msg_offset + msg_size,
        BridgeError::MalformedEd25519Data,
    );

    // Check pubkey.
    require!(
        &data[pubkey_offset..pubkey_offset + 32] == expected_pubkey.as_ref(),
        BridgeError::InvalidSignature,
    );

    // Check signature.
    require!(
        &data[sig_offset..sig_offset + 64] == expected_sig.as_ref(),
        BridgeError::InvalidSignature,
    );

    // Check message.
    require!(msg_size == message.len(), BridgeError::InvalidSignature);
    require!(
        &data[msg_offset..msg_offset + msg_size] == message,
        BridgeError::InvalidSignature,
    );

    Ok(())
}
