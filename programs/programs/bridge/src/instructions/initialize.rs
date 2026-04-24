use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use crate::state::Config;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitConfigArgs {
    pub game_signer: Pubkey,
    pub max_withdraw_per_epoch: u64,
    pub treasury_bump: u8,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = Config::LEN,
        seeds = [b"config"],
        bump,
    )]
    pub config: Account<'info, Config>,

    pub grind_mint: Account<'info, Mint>,

    /// Treasury ATA — must already exist and be owned by the treasury PDA.
    pub treasury_ata: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<Initialize>, args: InitConfigArgs) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.game_signer = args.game_signer;
    config.grind_mint = ctx.accounts.grind_mint.key();
    config.treasury_ata = ctx.accounts.treasury_ata.key();
    config.treasury_bump = args.treasury_bump;
    config.max_withdraw_per_epoch = args.max_withdraw_per_epoch;
    config.epoch_withdraw_used = 0;
    config.current_epoch = 0;
    Ok(())
}
