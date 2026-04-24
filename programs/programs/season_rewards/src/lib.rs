// Season Rewards — Merkle-distributed $GRIND payouts at season end.
//
// Flow:
//   1. Admin calls `initialize_season(season_id, merkle_root, total_pool)`.
//   2. Admin calls `fund_season(amount)` to transfer $GRIND from treasury to
//      the program's season ATA.
//   3. Players call `claim(season_id, index, amount, proof)` to receive their
//      share.  The program verifies the Merkle proof and marks the index claimed
//      in a bitmap PDA (SeasonClaims).
//   4. After 90 days, admin can call `sweep_unclaimed(season_id)` to return any
//      remainder to the treasury.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hashv;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("7Vbmv1jt4vyuqBZcpYPpnVhrqVe5e6ZzKBzQxJNNNsaH");

pub const CLAIM_WINDOW_SECONDS: i64 = 90 * 24 * 60 * 60;

#[program]
pub mod season_rewards {
    use super::*;

    pub fn initialize_season(
        ctx: Context<InitializeSeason>,
        season_id: u32,
        merkle_root: [u8; 32],
        total_pool: u64,
        max_claims: u32,
    ) -> Result<()> {
        let season = &mut ctx.accounts.season;
        season.season_id = season_id;
        season.merkle_root = merkle_root;
        season.total_pool = total_pool;
        season.claimed_total = 0;
        season.opened_at = Clock::get()?.unix_timestamp;
        season.admin = ctx.accounts.admin.key();
        season.max_claims = max_claims;
        season.bump = ctx.bumps.season;

        let claims = &mut ctx.accounts.season_claims;
        claims.season_id = season_id;
        claims.bitmap = vec![0; ((max_claims as usize) + 7) / 8];

        emit!(SeasonInitialized { season_id, merkle_root, total_pool });
        Ok(())
    }

    pub fn fund_season(ctx: Context<FundSeason>, amount: u64) -> Result<()> {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.funder_ata.to_account_info(),
                    to: ctx.accounts.season_ata.to_account_info(),
                    authority: ctx.accounts.admin.to_account_info(),
                },
            ),
            amount,
        )
    }

    pub fn claim(
        ctx: Context<Claim>,
        season_id: u32,
        index: u32,
        amount: u64,
        proof: Vec<[u8; 32]>,
    ) -> Result<()> {
        let season = &ctx.accounts.season;
        require!(season.season_id == season_id, SeasonError::SeasonMismatch);

        // Check already-claimed.
        let claims = &mut ctx.accounts.season_claims;
        require!(index < season.max_claims, SeasonError::IndexOutOfRange);
        let byte_i = (index / 8) as usize;
        let bit_i = (index % 8) as u8;
        let mask = 1u8 << bit_i;
        require!(claims.bitmap[byte_i] & mask == 0, SeasonError::AlreadyClaimed);

        // Verify Merkle proof.  Leaf = sha256(index_le | amount_le | recipient).
        let leaf = leaf_hash(index, amount, &ctx.accounts.recipient.key());
        let computed = reconstruct_root(leaf, &proof);
        require!(computed == season.merkle_root, SeasonError::InvalidProof);

        // Mark claimed.
        claims.bitmap[byte_i] |= mask;

        // Pay out.
        let season_id_le = season_id.to_le_bytes();
        let seeds: &[&[u8]] = &[b"season", season_id_le.as_ref(), &[season.bump]];
        let signer_seeds = &[seeds];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.season_ata.to_account_info(),
                    to: ctx.accounts.recipient_ata.to_account_info(),
                    authority: ctx.accounts.season.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
        )?;

        let season = &mut ctx.accounts.season;
        season.claimed_total = season.claimed_total.saturating_add(amount);

        emit!(RewardClaimed {
            season_id,
            index,
            recipient: ctx.accounts.recipient.key(),
            amount,
        });
        Ok(())
    }

    pub fn sweep_unclaimed(ctx: Context<SweepUnclaimed>, season_id: u32) -> Result<()> {
        let season = &ctx.accounts.season;
        require!(season.season_id == season_id, SeasonError::SeasonMismatch);
        let now = Clock::get()?.unix_timestamp;
        require!(
            now.saturating_sub(season.opened_at) >= CLAIM_WINDOW_SECONDS,
            SeasonError::ClaimWindowStillOpen,
        );

        let season_id_le = season_id.to_le_bytes();
        let seeds: &[&[u8]] = &[b"season", season_id_le.as_ref(), &[season.bump]];
        let signer_seeds = &[seeds];
        let remaining = ctx.accounts.season_ata.amount;
        if remaining > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.season_ata.to_account_info(),
                        to: ctx.accounts.treasury_ata.to_account_info(),
                        authority: ctx.accounts.season.to_account_info(),
                    },
                    signer_seeds,
                ),
                remaining,
            )?;
        }
        emit!(SeasonSwept { season_id, returned: remaining });
        Ok(())
    }
}

// ── Merkle verification (sha256, sorted-pair) ───────────────────────────────

fn leaf_hash(index: u32, amount: u64, recipient: &Pubkey) -> [u8; 32] {
    hashv(&[
        &index.to_le_bytes(),
        &amount.to_le_bytes(),
        recipient.as_ref(),
    ])
    .to_bytes()
}

fn reconstruct_root(leaf: [u8; 32], proof: &[[u8; 32]]) -> [u8; 32] {
    let mut cur = leaf;
    for sib in proof {
        cur = if cur <= *sib {
            hashv(&[&cur, sib]).to_bytes()
        } else {
            hashv(&[sib, &cur]).to_bytes()
        };
    }
    cur
}

// ── Accounts ────────────────────────────────────────────────────────────────

#[account]
pub struct Season {
    pub season_id: u32,
    pub merkle_root: [u8; 32],
    pub total_pool: u64,
    pub claimed_total: u64,
    pub opened_at: i64,
    pub admin: Pubkey,
    pub max_claims: u32,
    pub bump: u8,
}

impl Season {
    pub const LEN: usize = 8 + 4 + 32 + 8 + 8 + 8 + 32 + 4 + 1;
}

#[account]
pub struct SeasonClaims {
    pub season_id: u32,
    pub bitmap: Vec<u8>,
}

impl SeasonClaims {
    pub fn space(max_claims: u32) -> usize {
        8 + 4 + 4 + ((max_claims as usize + 7) / 8)
    }
}

#[derive(Accounts)]
#[instruction(season_id: u32, merkle_root: [u8; 32], total_pool: u64, max_claims: u32)]
pub struct InitializeSeason<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = Season::LEN,
        seeds = [b"season", season_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub season: Account<'info, Season>,

    #[account(
        init,
        payer = admin,
        space = SeasonClaims::space(max_claims),
        seeds = [b"claims", season_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub season_claims: Account<'info, SeasonClaims>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FundSeason<'info> {
    pub admin: Signer<'info>,

    #[account(mut, constraint = funder_ata.owner == admin.key())]
    pub funder_ata: Account<'info, TokenAccount>,

    #[account(mut)]
    pub season_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(season_id: u32)]
pub struct Claim<'info> {
    pub recipient: Signer<'info>,

    #[account(
        mut,
        seeds = [b"season", season_id.to_le_bytes().as_ref()],
        bump = season.bump,
    )]
    pub season: Account<'info, Season>,

    #[account(
        mut,
        seeds = [b"claims", season_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub season_claims: Account<'info, SeasonClaims>,

    #[account(mut)]
    pub season_ata: Account<'info, TokenAccount>,

    #[account(mut, constraint = recipient_ata.owner == recipient.key())]
    pub recipient_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(season_id: u32)]
pub struct SweepUnclaimed<'info> {
    #[account(constraint = admin.key() == season.admin)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"season", season_id.to_le_bytes().as_ref()],
        bump = season.bump,
    )]
    pub season: Account<'info, Season>,

    #[account(mut)]
    pub season_ata: Account<'info, TokenAccount>,

    #[account(mut)]
    pub treasury_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

// ── Events ──────────────────────────────────────────────────────────────────

#[event]
pub struct SeasonInitialized {
    pub season_id: u32,
    pub merkle_root: [u8; 32],
    pub total_pool: u64,
}

#[event]
pub struct RewardClaimed {
    pub season_id: u32,
    pub index: u32,
    pub recipient: Pubkey,
    pub amount: u64,
}

#[event]
pub struct SeasonSwept {
    pub season_id: u32,
    pub returned: u64,
}

// ── Errors ──────────────────────────────────────────────────────────────────

#[error_code]
pub enum SeasonError {
    #[msg("season id mismatch")]
    SeasonMismatch,
    #[msg("index out of range for this season")]
    IndexOutOfRange,
    #[msg("already claimed")]
    AlreadyClaimed,
    #[msg("invalid Merkle proof")]
    InvalidProof,
    #[msg("claim window still open; cannot sweep yet")]
    ClaimWindowStillOpen,
}
