# 07 — Solana Architecture

## Programs

Build custom programs only where required. Everything else uses standards.

| Program | Custom? | Purpose |
|---|---|---|
| $GRIND SPL Token | No (SPL) | The token |
| Bridge | **Yes** | Deposit/withdraw $GRIND between wallet and in-game |
| Item NFT | No (Metaplex Core) | NFT form for rare items |
| Item Bridge | **Yes** | Stake NFT items to enable in-game use |
| Season Rewards | **Yes** | Merkle-distributed season payouts |
| Treasury Multisig | No (Squads V4) | Treasury control |

Three custom programs. Small audit surface.

## Bridge program — accounts

```rust
// PDA seeds: [b"config"]
pub struct Config {
    pub admin: Pubkey,              // multisig PDA
    pub game_signer: Pubkey,        // ed25519 pubkey for voucher verification
    pub grind_mint: Pubkey,
    pub treasury_ata: Pubkey,       // ATA owned by treasury PDA
    pub treasury_bump: u8,
    pub max_withdraw_per_epoch: u64,
    pub epoch_withdraw_used: u64,
    pub current_epoch: u64,
}

// PDA seeds: [b"vault", user]
pub struct PlayerVault {
    pub user: Pubkey,
    pub nonce: u64,                 // last redeemed nonce
}

// Signed off-chain, redeemed on-chain
pub struct WithdrawVoucher {
    pub user: Pubkey,
    pub amount: u64,
    pub nonce: u64,
    pub expiry: i64,
    pub signature: [u8; 64],        // ed25519 over (user||amount||nonce||expiry)
}
```

## Bridge — instructions

```
initialize(config: InitConfig)
    // one-time, called by admin

deposit(amount: u64)
    // transfer user ATA → treasury ATA
    // emit DepositEvent { user, amount, slot }

withdraw(voucher: WithdrawVoucher)
    // verify ed25519 signature via sysvar
    // require voucher.nonce > PlayerVault.nonce
    // require voucher.expiry > clock.unix_timestamp
    // require voucher.amount <= max_withdraw_per_epoch - epoch_withdraw_used
    // transfer treasury → user ATA
    // bump PlayerVault.nonce

rotate_game_signer(new_signer: Pubkey)
    // admin-only (multisig)

update_config(...)
    // admin-only
```

## Security properties

- **Voucher replay prevention:** nonce strictly increasing per player.
- **Voucher expiry:** short TTL (minutes) to bound exposure.
- **Circuit breaker:** `max_withdraw_per_epoch` caps total withdrawals; if server is compromised, blast radius is bounded to one epoch's cap.
- **Deposit trust:** one-way (user → chain → indexer → DB). Receipts retained for dispute.
- **No `invoke_signed` outside bridge PDA authority** — treasury PDA is the only signer.
- **Ed25519 signature verification** uses Solana's `ed25519_program` sysvar (don't roll our own).

## Item Bridge

Items have three states:

1. **In-game only** — DB row, freely tradeable on GE.
2. **NFT minted** — metadata on-chain, player paid 5,000 $GRIND mint fee. DB row frozen (attributes immutable).
3. **NFT staked for play** — NFT is held by the program PDA, DB row is unfrozen for in-game use. On unstake, NFT returns to player and DB row re-freezes.

This prevents the "sold the NFT but kept using it" exploit.

## Season Rewards

1. Off-chain tallier computes final leaderboard payout per wallet at season end.
2. Merkle root + total pool size published on-chain.
3. Treasury transfers pool to Season Rewards program ATA.
4. Players submit Merkle proof + claim → receive payout.
5. Unclaimed after 90 days → returns to treasury.

## Chain indexer

- Subscribes to program logs via Helius webhooks (fallback: geyser).
- Writes to `chain_events` table idempotently (signature = PK).
- On `DepositEvent`, credits in-game wallet via `wallet_ledger` insert.
- Only trusted chain-reading path in the system.

## Audits

- **Two firms** (e.g. Neodyme + Ottersec) before mainnet.
- Anchor framework throughout.
- Tests: unit (per instruction) + integration (bankrun) + property-based (fuzz nonce/expiry/amount).
- **No mainnet deploy without both audits passed.**

## Program IDs

Placeholder — generated at `anchor build`:

```
bridge          = 11111111111111111111111111111111
item_bridge     = 22222222222222222222222222222222
season_rewards  = 33333333333333333333333333333333
```

Real IDs committed to `programs/Anchor.toml` after first build.
