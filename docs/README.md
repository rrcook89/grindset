# GRINDSET Design Docs

Reference docs for the game, economy, and technical architecture.

| # | Doc | Purpose |
|---|---|---|
| 01 | [Concept](01-concept.md) | Elevator pitch, fantasy, core loop |
| 02 | [Branding & Token](02-branding.md) | Brand identity, $GRIND, color palette, voice |
| 03 | [Gameplay](03-gameplay.md) | Skills, combat, quests, world, social |
| 04 | [Tokenomics](04-tokenomics.md) | Supply, faucets, sinks, equilibrium sim |
| 05 | [Combat](05-combat.md) | Damage, accuracy, abilities, PvE/PvP |
| 06 | [Skills](06-skills.md) | XP curves, progression, time-to-max |
| 07 | [Solana](07-solana.md) | Program inventory, account model, security |
| 08 | [Backend](08-backend.md) | Service topology, zone worker, networking |
| 09 | [Data Model](09-data-model.md) | Postgres schema |
| 10 | [Anti-Bot](10-anti-bot.md) | Detection layers, response gradient |
| 11 | [Art Pipeline](11-art-pipeline.md) | Style, assets, production plan |
| 12 | [Roadmap](12-roadmap.md) | MVP sprint plan, launch cadence |

## Design principles

1. **Gameplay beats tokenomics.** If it's not fun without the token, the token won't save it.
2. **Server-authoritative always.** Client is dumb.
3. **On-chain is the settlement layer, not the game.** Minimize on-chain surface.
4. **Sinks ≥ faucets.** Deflation is the feature.
5. **No pay-to-win.** Wealth buys time, not skill ceiling.
6. **Seasons over forever-grind.** 4-month content cycles.
