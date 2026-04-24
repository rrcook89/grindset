use anchor_lang::prelude::*;

#[error_code]
pub enum BridgeError {
    #[msg("Voucher nonce must be greater than the player's last redeemed nonce")]
    NonceTooLow,

    #[msg("Voucher has expired")]
    VoucherExpired,

    #[msg("Epoch withdrawal cap exceeded")]
    EpochCapExceeded,

    #[msg("Ed25519 signature verification failed")]
    InvalidSignature,

    #[msg("Voucher user does not match the signer")]
    UserMismatch,

    #[msg("Deposit amount must be greater than zero")]
    ZeroAmount,

    #[msg("Ed25519 instruction must precede the withdraw instruction")]
    MissingEd25519Instruction,

    #[msg("Ed25519 sysvar data is malformed")]
    MalformedEd25519Data,

    #[msg("Caller is not the admin")]
    Unauthorized,
}
