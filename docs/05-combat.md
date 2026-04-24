# 05 — Combat Formulas

## Stats

- **Strength** — melee damage
- **Attack** — melee accuracy
- **Defense** — damage reduction, all styles
- **Ranged** — damage + accuracy
- **Magic** — damage + accuracy
- **Constitution / HP** — derived: `100 + 10 × avg(combat skills)`

Each combat skill levels 1–20.

## Hit resolution (per attack tick)

```
attackerRoll = (accuracy + style_bonus + gear_accuracy) × (1 + rand(-0.1, 0.1))
defenderRoll = (defense  + gear_defense_vs_style)      × (1 + rand(-0.1, 0.1))

if attackerRoll > defenderRoll:
    hitChance = 1 - (defenderRoll / (2 × attackerRoll))
else:
    hitChance = attackerRoll / (2 × defenderRoll)

if rand() < hitChance:
    damage = rand(1, maxHit)
else:
    damage = 0
```

## Max hit (melee)

```
effectiveStr = strength + gear_str_bonus + style_bonus + prayer_bonus
maxHit       = floor(0.5 + effectiveStr × (weapon_tier_scalar / 64))
```

`weapon_tier_scalar` ranges 40 (bronze) → 220 (runic) across 10 tiers.

Example: level-10 strength, steel sword (85) → maxHit ≈ 14.
Example: level-20 strength, runic (220) → maxHit ≈ 69.

Scaling is ~5× start to end — enough progression, not so much that early players are irrelevant in group content.

## Attack speed

| Weapon class | Ticks | Interval |
|---|---|---|
| Dagger / wand | 2 | 800ms |
| Sword / staff | 3 | 1.2s |
| Axe / bow | 4 | 1.6s |
| Greataxe / longbow | 5 | 2.0s |

DPS target: all tiers within a style within 15% DPS at equal level. Weapon choice = preference and utility.

## Style triangle

- Melee beats Ranged (+15% accuracy)
- Ranged beats Magic (+15%)
- Magic beats Melee (+15%)

## Abilities (5-slot loadout)

| Ability | Effect | CD |
|---|---|---|
| Cleave (melee) | 150% dmg to 3 adjacent | 18s |
| Sunder (melee) | Ignore 50% defense on next hit | 24s |
| Snipe (ranged) | Guaranteed hit, 200% dmg, range+2 | 30s |
| Bola (ranged) | Root 4 ticks | 45s |
| Ember (magic) | DoT 8/tick for 5 ticks | 20s |
| Glyph (magic) | Absorb 40% dmg for 10 ticks | 60s |
| Dash (any) | Move 4 tiles instantly | 15s |
| Field Dressing (any) | Heal 25% HP, OOC only | 60s |

Players unlock abilities via training. Slotting is free; reslotting costs a small $GRIND fee.

## PvE tuning

Geared-to-tier player solos same-tier mob at ~15% HP loss per kill, no food.
+2 tiers = dangerous. +3 tiers = party needed.

## PvP tuning

- All damage ×0.65.
- Ability cooldowns ×1.5.
- Food eat delay: 4 ticks in PvP (1 tick in PvE).

## Boss design

3-phase mechanics with telegraphed tile AoEs. Designed for 5-person parties. Heavy on rare NFT-mintable drops. Weekly account lockout per boss.

## Death

- **PvE:** respawn at home town. Items drop on ground 2 minutes.
- **PvP (Ruinfields only):** items + $GRIND drop. 30% of $GRIND burns, 70% to killer. Gear to killer if not claimed by corpse owner within 30 seconds.
