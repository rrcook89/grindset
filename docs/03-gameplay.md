# 03 — Gameplay Systems

## Skills (launch set — 8)

| Skill | Loop | Output |
|---|---|---|
| Mining | Click rock, wait tick, roll loot | Ores (crafting input) |
| Fishing | Click spot, passive ticks, catches | Raw fish |
| Woodcutting | Click tree, ticks, logs | Logs |
| Combat (Melee / Ranged / Magic) | Target mob, auto-attack ticks, abilities | Loot, $GRIND |
| Cooking | Combine raw + fire | Food (HP restore) |
| Smithing | Bars + coal at anvil | Weapons / armor |
| Alchemy | Herbs + vials | Potions |
| Cartography | Discover tiles, sell maps | Map items (NFT-able) |

Cartography is the differentiator — you can *sell* knowledge of the world to new players, creating an emergent info-economy.

## Combat (summary — see 05-combat.md for formulas)

- Tick-based, 3 styles (Melee / Ranged / Magic) in a rock-paper-scissors relationship.
- 5-ability loadout. Swap in town; small $GRIND cost (sink).
- PvP opt-in per zone. Ruinfields = high risk, $GRIND drops on death.
- PvP death tax: 30% of dropped $GRIND burned, 70% to killer.
- PvE death: respawn at home town, items drop on the ground for 2 minutes (anyone can grab).

## Quests

- 15–20 hand-authored launch quests, puzzle-driven, story-rich.
- Rewards: XP, items, cosmetics, occasional $GRIND (not the primary faucet).
- Seasonal quest arc tied to lore drops.

## Trading

- **Grand Bazaar** (async order book): handles ~95% of volume. 2% fee burned.
- **Direct trade**: two-player trade window with confirm screen.
- **NPC shops**: bootstrap items, fixed prices.

## World

| Region | Tier | Notes |
|---|---|---|
| Mireholm | Starter | Tutorial, bank, GE |
| Verdant Reach | Mid | Farming, woodcutting, low mining |
| Ashspire Foothills | Mid-high | Smithing, ore, dwarven quests |
| Ruinfields | High-risk PvP | Best drops, $GRIND on death |
| Tidebreak Isles | High | Fishing, magic, sea bosses |
| Scribes' Vault | Endgame | Seasonal dungeon |

## Factions

Soft alignment (not hard gates). Affects NPC prices and quest availability.

- **The Ledger** — merchants
- **The Deepcrew** — miners / explorers
- **The Ember Circle** — combat / PvP

## Social

- Global, zone, guild, trade chat.
- Guilds cap ~50 members. Can claim Ruinfields territory (seasonal).
- Parties up to 5 for dungeons.
- Friend list with online status.

## Day/night cycle

30-minute real-time loop. Affects mob spawns (nocturnal/diurnal) and some skilling nodes (rare herbs, fishing spots).
