# 06 — Skill Progression

## XP curve

```
xpForLevel(n) = floor(80 × (1.12^n - 1) / 0.12)
```

| Level | XP this level | Cumulative |
|---|---|---|
| 2 | 80 | 80 |
| 5 | 450 | 1,100 |
| 10 | 1,400 | 5,500 |
| 15 | 2,800 | 16,500 |
| 20 (max) | 5,500 | 42,000 |

## Target time-to-max per skill

**~40 hours active play to level 20.** An "all-max" account is ~300 hours — prestige but reachable in one season by dedicated players.

## Action rates (tuned to hit targets)

### Mining
- 1 ore per 6 ticks = 10/min = 600/hr (tier 1).
- XP: 5 per ore → 3,000/hr.
- Gated by access to higher-tier rocks (regional progression) stretching real time.

### Fishing
- 1 catch per 8 ticks = 7.5/min = 450/hr.
- XP: 6 per catch → 2,700/hr.

### Woodcutting
- 1 log per 5 ticks = 12/min = 720/hr.
- XP: 4 per log → 2,880/hr.

### Combat
- 1 tier-appropriate kill per ~20 ticks = 9/min = 540/hr.
- XP: 50/kill → 27,000/hr (higher than skilling; reflects risk).

### Smithing / Cooking / Alchemy
- Processing skills — XP per item crafted, rate limited by material cost.

### Cartography
- XP per unique tile discovered, plus bonus on map sale.

## Diminishing returns on bot cadence

Actions performed at superhuman consistency (inter-click variance below threshold) silently scale XP to 0. Botters learn only via leaderboard comparison — cheap to maintain, expensive to dodge.

## Level rewards (per level)

- **Every level:** +5 stat points to assign (for combat skills: STR/ATK/DEF/etc).
- **Every 5 levels:** unlocks access to new regions / nodes / recipes.
- **Level 20:** ability unlock (one per combat skill), cosmetic title, small one-time $GRIND reward.

## Tutorial progression

- Tutorial quest unlocks Mining 1, Combat 1, Bank, GE.
- First 5 levels of any skill are ~2× XP to get players off the onboarding hump fast.
- Level 1–5 emission drops are scaled down 50% to prevent new-account farming.
