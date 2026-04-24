# GRINDSET

> Touch grass? Mine it.

A browser-based MMORPG with a real on-chain gold piece. Inspired by Old School RuneScape, built for the 2020s.

- **Game:** top-down, tick-based, skill-heavy, trade-driven
- **Token:** `$GRIND` (SPL on Solana) — the in-game currency, tradeable off-chain too
- **Stack:** Go + Postgres backend, React+Pixi client, Anchor programs
- **Stance:** self-aware, meme-native, gameplay-first

## Quick start

```bash
git clone <this-repo>
cd grindset
make up          # boots Postgres, Redis, NATS
make migrate     # applies schema
make server      # starts game server on :8080
make web         # starts web client on :5173
```

Open http://localhost:5173, walk around, get mired.

## Docs

- [Concept](docs/01-concept.md) — what the game is
- [Branding & Token](docs/02-branding.md) — brand identity and $GRIND
- [Gameplay](docs/03-gameplay.md) — skills, combat, world, social
- [Tokenomics](docs/04-tokenomics.md) — supply, faucets, sinks, simulation
- [Combat Formulas](docs/05-combat.md)
- [Skill Progression](docs/06-skills.md)
- [Solana Architecture](docs/07-solana.md) — program design
- [Backend Architecture](docs/08-backend.md)
- [Data Model](docs/09-data-model.md) — Postgres schema
- [Anti-Bot](docs/10-anti-bot.md)
- [Art Pipeline](docs/11-art-pipeline.md)
- [Roadmap](docs/12-roadmap.md) — week-by-week MVP plan

## Status

Pre-MVP scaffold. See [docs/12-roadmap.md](docs/12-roadmap.md).

## License

TBD — do not redistribute yet.
