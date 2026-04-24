use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod state;
pub mod instructions;

use instructions::{
    initialize::{Initialize, InitConfigArgs},
    deposit::Deposit,
    withdraw::{Withdraw, WithdrawVoucher},
    admin::{
        RotateGameSigner, UpdateConfig, UpdateConfigArgs,
        rotate_game_signer_handler, update_config_handler,
    },
};

// Placeholder — replace with real ID after `anchor build`.
declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod bridge {
    use super::*;

    /// One-time initialisation.  Must be called by the admin before any other
    /// instruction.
    pub fn initialize(ctx: Context<Initialize>, args: InitConfigArgs) -> Result<()> {
        instructions::initialize::handler(ctx, args)
    }

    /// Transfer `amount` $GRIND from the user's ATA to the treasury ATA.
    /// Emits `DepositEvent`.
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        instructions::deposit::handler(ctx, amount)
    }

    /// Redeem a game-server-signed voucher to transfer $GRIND from treasury to
    /// the user's ATA.  The caller **must** prepend an Ed25519Program
    /// instruction to the same transaction (Solana's native sig verification).
    pub fn withdraw(ctx: Context<Withdraw>, voucher: WithdrawVoucher) -> Result<()> {
        instructions::withdraw::handler(ctx, voucher)
    }

    /// Replace the ed25519 signing key used for voucher verification.
    /// Admin-only.  Use after a server compromise (see docs/10-anti-bot.md).
    pub fn rotate_game_signer(
        ctx: Context<RotateGameSigner>,
        new_signer: Pubkey,
    ) -> Result<()> {
        rotate_game_signer_handler(ctx, new_signer)
    }

    /// Roll over the epoch or adjust the withdrawal cap.  Admin-only.
    pub fn update_config(ctx: Context<UpdateConfig>, args: UpdateConfigArgs) -> Result<()> {
        update_config_handler(ctx, args)
    }
}
