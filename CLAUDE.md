# GRINDSET — Project Context

**Game:** GRINDSET — a browser-based, top-down MMORPG inspired by Old School RuneScape.
**Token:** `$GRIND` — SPL token on Solana, serves as in-game currency.
**Stance:** Memeable, viral, self-aware. Gameplay-first; the token is the gold piece, not the product.

## Repo layout

```
apps/
  server/        Go game server (zone-sharded, WS, 400ms tick)
  web/           React + Pixi client
  indexer/       Go chain indexer (Helius webhooks → DB)
programs/        Anchor/Solana programs (bridge, item-bridge, season-rewards)
packages/
  tokenomics-sim/   TS simulator for emission/sink balancing
  protocol/         Shared WS opcodes / message types
infra/
  docker/        Local dev compose
  migrations/    SQL (goose-style)
docs/            Design docs (01-concept through 12-roadmap)
```

## How to run (local dev)

```bash
# Bring up Postgres + Redis + NATS
make up

# Game server
make server

# Web client
make web

# Apply migrations
make migrate
```

## Stack

- **Backend:** Go 1.22, Postgres, Redis, NATS
- **Frontend:** React 18 + TypeScript + Vite + PixiJS v8
- **Chain:** Solana mainnet, Anchor 0.30, Metaplex Core (for NFT items)
- **Infra:** Fly.io for servers, Cloudflare in front, Helius for chain RPC + webhooks

## Coding conventions

- Server-authoritative; never trust the client.
- Binary WS protocol, opcodes defined in `packages/protocol`.
- All wallet movement is ledger-based; balances are views over the ledger.
- On-chain surface is minimal: bridge, NFT bridge, season rewards. Everything else is off-chain.
- Anchor programs audited by two firms (Neodyme + Ottersec) before mainnet.

## Key design decisions (don't relitigate without cause)

- **Hybrid custody:** in-game $GRIND is server-custodied (DB writes); withdraws settle on-chain via signed vouchers.
- **Tick rate:** 400ms server tick. Client interpolates.
- **XP ceiling:** level 20 per skill (not 99). Seasons cycle content.
- **Geofence US on withdraw** until legal path is clear. Play is unrestricted.

## Docs

See [docs/README.md](docs/README.md) for the full index.

<!-- IJFW-MEMORY-START (managed -- do not edit manually) -->
<!-- IJFW-MEMORY-END -->
