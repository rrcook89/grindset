use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::Config;
use crate::events::DepositEvent;
use crate::errors::BridgeError;

#[derive(Accounts)]
pub struct Deposit<'info> {
    pub user: Signer<'info>,

    #[account(
        seeds = [b"config"],
        bump,
    )]
    pub config: Account<'info, Config>,

    /// User's $GRIND ATA — tokens are pulled from here.
    #[account(
        mut,
        constraint = user_ata.owner == user.key(),
        constraint = user_ata.mint == config.grind_mint,
    )]
    pub user_ata: Account<'info, TokenAccount>,

    /// Treasury ATA — tokens land here.
    #[account(
        mut,
        constraint = treasury_ata.key() == config.treasury_ata,
    )]
    pub treasury_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    require!(amount > 0, BridgeError::ZeroAmount);

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_ata.to_account_info(),
                to: ctx.accounts.treasury_ata.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        amount,
    )?;

    emit!(DepositEvent {
        user: ctx.accounts.user.key(),
        amount,
        slot: Clock::get()?.slot,
    });

    Ok(())
}
