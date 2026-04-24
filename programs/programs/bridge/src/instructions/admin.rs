use anchor_lang::prelude::*;
use crate::state::Config;
use crate::errors::BridgeError;

// ── rotate_game_signer ────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct RotateGameSigner<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"config"],
        bump,
        constraint = config.admin == admin.key() @ BridgeError::Unauthorized,
    )]
    pub config: Account<'info, Config>,
}

pub fn rotate_game_signer_handler(
    ctx: Context<RotateGameSigner>,
    new_signer: Pubkey,
) -> Result<()> {
    ctx.accounts.config.game_signer = new_signer;
    Ok(())
}

// ── update_config ─────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UpdateConfigArgs {
    /// If Some, advance the epoch counter and reset epoch_withdraw_used to 0.
    pub new_epoch: Option<u64>,
    /// If Some, update the per-epoch withdrawal cap.
    pub max_withdraw_per_epoch: Option<u64>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"config"],
        bump,
        constraint = config.admin == admin.key() @ BridgeError::Unauthorized,
    )]
    pub config: Account<'info, Config>,
}

pub fn update_config_handler(
    ctx: Context<UpdateConfig>,
    args: UpdateConfigArgs,
) -> Result<()> {
    let config = &mut ctx.accounts.config;

    if let Some(new_epoch) = args.new_epoch {
        config.current_epoch = new_epoch;
        config.epoch_withdraw_used = 0;
    }

    if let Some(cap) = args.max_withdraw_per_epoch {
        config.max_withdraw_per_epoch = cap;
    }

    Ok(())
}
