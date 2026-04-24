# 12 — MVP Roadmap

2-week sprints. Every sprint ships to staging. Closed alpha at week 22; mainnet launch at week 28.

## Sprint 1 (w1–2) — Walking skeleton

- Go game server boots, accepts WS connection.
- React + Pixi client renders 50×50 tile zone.
- Player logs in (hardcoded account), walks, visible to other clients.
- CI/CD: merge → staging deploy.
- **Exit:** two browser tabs, two wizards walking around.

## Sprint 2 (w3–4) — Auth + persistence

- Email/password auth (Magic link or Clerk).
- Postgres schema v1: accounts, characters, skills.
- Character save/load on join/leave.
- Basic global chat.
- **Exit:** log out, log back in, state preserved.

## Sprint 3 (w5–6) — First skill (Mining)

- `item_definitions` + `items` tables.
- Mining nodes on map, click-to-mine, tick resolution.
- XP, level-up event, UI toast.
- Bank UI.
- **Exit:** reach mining level 5, bank full of ore.

## Sprint 4 (w7–8) — Combat v1

- Mob spawns + pathing AI.
- Melee combat per `05-combat.md` formulas.
- Weapon definitions, tier bonuses.
- Death + respawn.
- **Exit:** kill 50 mobs, loot drops, die dramatically once.

## Sprint 5 (w9–10) — Woodcutting + Smithing

- Second and third skills; crafting chain (ore → bar → weapon at anvil).
- Repair mechanic (stubbed $GRIND counter).
- UI polish: hotbar, context menus.
- **Exit:** mine → smelt → smith → repair → fight.

## Sprint 6 (w11–12) — $GRIND devnet + Bridge

- Deploy $GRIND SPL to devnet.
- Bridge program + deposit/withdraw.
- Wallet connect (Phantom adapter).
- In-game wallet UI + `wallet_ledger`.
- Mob drops + fees move $GRIND.
- **Exit:** deposit devnet $GRIND, buy item, earn more, withdraw.

## Sprint 7 (w13–14) — Grand Bazaar

- Order book + matching engine.
- Order UI (post, active, history, price chart).
- 2% fee burn to treasury PDA.
- **Exit:** two players trade via GE; fee burn visible on devnet.

## Sprint 8 (w15–16) — Fishing + Cooking

- Fourth and fifth skills.
- Food HP restore.
- Combat eating with tick delay.
- **Exit:** catch → cook → eat in combat, survive.

## Sprint 9 (w17–18) — World expansion

- Verdant Reach and Ashspire Foothills zones.
- Zone handoff path.
- Teleport scrolls (sink).
- **Exit:** cross-zone travel, distinct biomes and mobs.

## Sprint 10 (w19–20) — Quests + polish

- Quest engine, state persistence, 5 launch quests.
- Tutorial quest.
- Onboarding for wallet-less new players (gas sponsorship first deposit).
- Mobile layout pass.
- **Exit:** new player completes tutorial on mobile with no prior Solana experience.

## Sprint 11 (w21–22) — Closed alpha

- Anti-bot layers 1 + 2 live.
- Withdraw gates live.
- Synthetic load test to 500 CCU.
- Invite 100 alpha testers.
- Grafana dashboards (CCU, drops, burns, errors).
- **Exit:** closed alpha open. Data flowing.

## Sprint 12 (w23–24) — Audit + content

- Code freeze on Anchor programs. Submit to Audit Firm 1.
- Content: 10 more quests, Ruinfields PvP zone.
- Balance tuning from alpha data.

## Sprint 13 (w25–26) — Audit fixes + PvP

- Resolve firm-1 findings. Submit to Firm 2.
- PvP combat live in Ruinfields.
- PvP death tax burns.
- Bounty system.

## Sprint 14 (w27–28) — Mainnet launch

- Deploy programs to mainnet.
- Seed $GRIND liquidity on Raydium (locked 2 years).
- Marketing push (KOL seeding already in flight).
- Season 0 begins.
- Open beta: anyone plays, mainnet $GRIND live.
- **Launch.**

## Seasons (post-launch, 4-month cadence)

| Season | Content |
|---|---|
| 1 | Tidebreak Isles + Alchemy + first boss |
| 2 | Cartography + guild territory system |
| 3 | Scribes' Vault endgame dungeon + NFT rares |
| 4 | Governance-lite for $GRIND stakers |

## Team (by week 0)

- 1 product/design lead (you)
- 2 backend (1 Go core, 1 Solana/Anchor)
- 2 frontend (1 senior Pixi+React, 1 mid UI)
- 2 artists (1 senior, 1 mid by w8)
- 1 community lead (by w16)
- 1 PT QA / combat-tuning designer (by w12)

## Runway target

18 months at ~$95k/month loaded salaries + ~$5k infra + ~$120k audits + $100–250k marketing budget = **~$1.8–2.2M**.

## Critical risks

| Risk | Mitigation |
|---|---|
| Token dumping at launch | No VC cliffs, slow emission, aggressive sinks |
| Smart-contract exploit | Minimal on-chain surface, 2 audits, circuit breaker |
| Regulatory heat | Geofence US withdraws, utility framing, no yield language |
| Bot armies | Layered detection + soft responses, dedicated anti-cheat eng by m6 |
| The meme dies | Make the game genuinely fun without the token |

## North star

**If you remove the token and the game is still fun, we win. If you remove the game and the token still has users, we lose.**
