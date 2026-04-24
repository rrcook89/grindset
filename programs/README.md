# GRINDSET — Solana Programs

Three custom Anchor programs.

| Program | Purpose |
|---|---|
| `bridge` | Deposit/withdraw `$GRIND` between user wallet and game treasury |
| `item_bridge` | Mint/stake/unstake rare items as NFTs |
| `season_rewards` | Merkle-distributed season payouts |

See [../docs/07-solana.md](../docs/07-solana.md) for the authoritative spec.

## Prerequisites

- Rust 1.78+ (`rustup default stable`)
- Solana CLI 1.18+ (`sh -c "$(curl -sSfL https://release.solana.com/stable/install)"`)
- Anchor 0.30.1 (`cargo install --git https://github.com/coral-xyz/anchor avm --force && avm install 0.30.1 && avm use 0.30.1`)
- Node 20+ and `pnpm`

## Install

```bash
cd programs
pnpm install
```

## Build

```bash
anchor build
```

After the first build, commit the generated program IDs to `Anchor.toml` (replace the placeholders). Re-run `anchor build` to embed the real IDs into each binary.

## Test

```bash
anchor test
```

This spins up a local validator, deploys the programs, and runs the TypeScript tests.

Sprint-1 tests are *scaffolds* — they exercise shape and crypto helpers, not the full happy paths. Full instruction-level tests land with Sprint 6 (Bridge) and Sprint 12 (Season Rewards).

## Deploy to devnet

```bash
solana config set --url devnet
solana airdrop 2                   # first time
anchor deploy --provider.cluster devnet
```

## Generate a withdraw voucher (dev)

```bash
pnpm run gen-voucher -- \
  --user <user_pubkey> \
  --amount 1000000000 \
  --nonce 1 \
  --expiry 9999999999 \
  --signer-keypair ~/.config/solana/game-signer.json
```

The printed JSON contains the canonical 56-byte message and its ed25519 signature. Feed these into your client alongside an `Ed25519Program` pre-instruction when calling `bridge.withdraw()`.

## Security model

Minimal on-chain surface. Three properties to remember:

1. **Voucher replay:** every `PlayerVault.nonce` is strictly increasing.
2. **Voucher expiry:** short TTL (minutes), enforced on-chain.
3. **Circuit breaker:** `max_withdraw_per_epoch` caps total withdrawals. If the game server's signing key is compromised, the blast radius is bounded to one epoch.

All admin operations are gated behind a Squads multisig. The ed25519 game-signer key can be rotated via `rotate_game_signer`.

## Audits

Before mainnet: **two independent firms** (Neodyme + Ottersec). Non-negotiable.
