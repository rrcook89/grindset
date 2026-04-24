// Item Bridge — mint in-game items as NFTs and stake/unstake them for play.
//
// Sprint-1 scaffold: correct account shapes and state transitions.
// Metaplex Core CPIs are marked TODO — they'll land once the mpl-core crate is
// wired into Anchor.toml's dependency set.  The shape is the important part for
// now; see docs/07-solana.md for the full spec.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount, Transfer};

declare_id!("HmbTLCmaGvZhKnn1Zfa1JVnre7ash7iAf2WUqHmfvxgU");

pub const MINT_FEE: u64 = 5_000 * 1_000_000_000; // 5,000 $GRIND, 9 decimals
pub const MINT_FEE_BURN_BPS: u16 = 8_000;        // 80% burn
pub const MINT_FEE_TREASURY_BPS: u16 = 2_000;    // 20% treasury

#[program]
pub mod item_bridge {
    use super::*;

    /// Mint an in-game item to an on-chain NFT.  Charges 5,000 $GRIND:
    /// 80% burned, 20% to treasury.  The NFT is owned by the user; the DB
    /// freezes the item's attributes when the server observes this event.
    pub fn mint_to_nft(
        ctx: Context<MintToNft>,
        item_id: [u8; 16],
        metadata_uri: String,
    ) -> Result<()> {
        require!(metadata_uri.len() <= 200, ItemBridgeError::UriTooLong);

        let burn_amt = MINT_FEE * MINT_FEE_BURN_BPS as u64 / 10_000;
        let treasury_amt = MINT_FEE - burn_amt;

        // Burn 80%
        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.grind_mint.to_account_info(),
                    from: ctx.accounts.payer_ata.to_account_info(),
                    authority: ctx.accounts.payer.to_account_info(),
                },
            ),
            burn_amt,
        )?;

        // Transfer 20% to treasury
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.payer_ata.to_account_info(),
                    to: ctx.accounts.treasury_ata.to_account_info(),
                    authority: ctx.accounts.payer.to_account_info(),
                },
            ),
            treasury_amt,
        )?;

        // TODO: Metaplex Core CPI — mint the NFT asset with `metadata_uri`.
        //       Depends on mpl-core dep landing in Cargo.toml.

        let record = &mut ctx.accounts.item_record;
        record.item_id = item_id;
        record.owner = ctx.accounts.payer.key();
        record.state = ItemState::NftMintedIdle;
        record.metadata_uri = metadata_uri;

        emit!(ItemMinted {
            item_id,
            owner: record.owner,
            burned: burn_amt,
            to_treasury: treasury_amt,
        });

        Ok(())
    }

    /// Stake the NFT to the program PDA, unfreezing the DB row for in-game use.
    pub fn stake_for_play(ctx: Context<StakeForPlay>) -> Result<()> {
        let record = &mut ctx.accounts.item_record;
        require!(
            record.state == ItemState::NftMintedIdle,
            ItemBridgeError::InvalidStateTransition,
        );
        require!(record.owner == ctx.accounts.owner.key(), ItemBridgeError::NotOwner);

        // TODO: Metaplex Core CPI — transfer NFT to custody_pda.

        record.state = ItemState::NftStakedForPlay;
        emit!(ItemStaked { item_id: record.item_id, owner: record.owner });
        Ok(())
    }

    /// Return the NFT to the owner; the DB re-freezes the row.
    pub fn unstake(ctx: Context<Unstake>) -> Result<()> {
        let record = &mut ctx.accounts.item_record;
        require!(
            record.state == ItemState::NftStakedForPlay,
            ItemBridgeError::InvalidStateTransition,
        );
        require!(record.owner == ctx.accounts.owner.key(), ItemBridgeError::NotOwner);

        // TODO: Metaplex Core CPI — transfer NFT back from custody_pda.

        record.state = ItemState::NftMintedIdle;
        emit!(ItemUnstaked { item_id: record.item_id, owner: record.owner });
        Ok(())
    }
}

// ── State ───────────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone, PartialEq, Eq, Debug)]
pub enum ItemState {
    InGame,
    NftMintedIdle,
    NftStakedForPlay,
}

#[account]
pub struct ItemRecord {
    pub item_id: [u8; 16],
    pub owner: Pubkey,
    pub state: ItemState,
    pub metadata_uri: String, // ≤ 200 bytes
}

impl ItemRecord {
    pub const LEN: usize = 8 + 16 + 32 + 1 + 4 + 200;
}

// ── Accounts ────────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(item_id: [u8; 16])]
pub struct MintToNft<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut)]
    pub grind_mint: Account<'info, Mint>,

    #[account(mut, constraint = payer_ata.owner == payer.key())]
    pub payer_ata: Account<'info, TokenAccount>,

    #[account(mut)]
    pub treasury_ata: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = payer,
        space = ItemRecord::LEN,
        seeds = [b"item", item_id.as_ref()],
        bump,
    )]
    pub item_record: Account<'info, ItemRecord>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct StakeForPlay<'info> {
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [b"item", item_record.item_id.as_ref()],
        bump,
    )]
    pub item_record: Account<'info, ItemRecord>,
}

#[derive(Accounts)]
pub struct Unstake<'info> {
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [b"item", item_record.item_id.as_ref()],
        bump,
    )]
    pub item_record: Account<'info, ItemRecord>,
}

// ── Events ──────────────────────────────────────────────────────────────────

#[event]
pub struct ItemMinted {
    pub item_id: [u8; 16],
    pub owner: Pubkey,
    pub burned: u64,
    pub to_treasury: u64,
}

#[event]
pub struct ItemStaked {
    pub item_id: [u8; 16],
    pub owner: Pubkey,
}

#[event]
pub struct ItemUnstaked {
    pub item_id: [u8; 16],
    pub owner: Pubkey,
}

// ── Errors ──────────────────────────────────────────────────────────────────

#[error_code]
pub enum ItemBridgeError {
    #[msg("metadata URI too long (max 200 bytes)")]
    UriTooLong,
    #[msg("invalid state transition")]
    InvalidStateTransition,
    #[msg("not the item's owner")]
    NotOwner,
}
