use anchor_lang::prelude::*;

#[account]
pub struct Config {
    /// Multisig admin — only this key can call admin instructions.
    pub admin: Pubkey,
    /// Ed25519 public key used by the game server to sign withdraw vouchers.
    pub game_signer: Pubkey,
    /// $GRIND SPL mint address.
    pub grind_mint: Pubkey,
    /// Treasury ATA that holds all bridged tokens.
    pub treasury_ata: Pubkey,
    /// Bump for the treasury PDA (not the config PDA).
    pub treasury_bump: u8,
    /// Maximum $GRIND (in token units) that may be withdrawn in one epoch.
    pub max_withdraw_per_epoch: u64,
    /// How much has been withdrawn in the current epoch.
    pub epoch_withdraw_used: u64,
    /// Monotonically increasing epoch counter.  The game server increments
    /// this via update_config when rolling over to the next epoch window.
    pub current_epoch: u64,
}

impl Config {
    // 8 discriminator + 3×32 pubkeys + 1 bump + 3×8 u64
    pub const LEN: usize = 8 + 32 + 32 + 32 + 32 + 1 + 8 + 8 + 8;
}

#[account]
pub struct PlayerVault {
    /// Owner of this vault.
    pub user: Pubkey,
    /// Last nonce successfully redeemed.  Next voucher must have nonce > this.
    pub nonce: u64,
}

impl PlayerVault {
    pub const LEN: usize = 8 + 32 + 8;
}

/// Passed as instruction data to `withdraw`.  The game server constructs and
/// signs this off-chain.  The on-chain program verifies the ed25519 signature
/// via the Instructions sysvar (a preceding ed25519 program instruction).
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct WithdrawVoucher {
    pub user: Pubkey,
    pub amount: u64,
    pub nonce: u64,
    pub expiry: i64,
    /// Ed25519 signature over canonical_payload(user||amount||nonce||expiry).
    pub signature: [u8; 64],
}
