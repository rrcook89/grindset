# 04 — Tokenomics

## Supply

**Hard cap: 1,000,000,000 $GRIND** (SPL, 9 decimals)

Genesis distribution:

| Bucket | % | Amount | Vest |
|---|---|---|---|
| Play-to-earn pool | 40% | 400,000,000 | 8-year emission curve |
| Liquidity | 20% | 200,000,000 | Locked 2 years |
| Team | 15% | 150,000,000 | 4-year vest, 1-year cliff |
| Treasury | 15% | 150,000,000 | Multisig-controlled |
| Community / airdrop / marketing | 10% | 100,000,000 | Staged |

No private sale. No VC allocation. "We are the retail" is part of the brand.

## Emission schedule

| Year | Emission | Cumulative | Daily avg |
|---|---|---|---|
| 1 | 80,000,000 | 80M | 219,178 |
| 2 | 70,000,000 | 150M | 191,781 |
| 3 | 60,000,000 | 210M | 164,384 |
| 4 | 50,000,000 | 260M | 136,986 |
| 5 | 40,000,000 | 300M | 109,589 |
| 6 | 35,000,000 | 335M | 95,890 |
| 7 | 35,000,000 | 370M | 95,890 |
| 8 | 30,000,000 | 400M | 82,192 |

Emission transfers daily from a treasury PDA to the game system wallet. The server allocates to players per tick; the chain never sees per-action drips.

## Faucets (base rates; region tier multiplies ×1.0–×4.0)

| Activity | Rate | Cap | Base $/hr |
|---|---|---|---|
| Mining | 0.8 per action | 400/hr | 320 |
| Fishing | 0.6 per action | 500/hr | 300 |
| Woodcutting | 0.5 per action | 500/hr | 250 |
| Combat T1 | 3–8 drop | 150/hr | ~750 |
| Combat T3 | 20–40 drop | 80/hr | ~2,400 |
| Daily quest | 500–2,000 | 1/day | — |
| Weekly quest | 5,000–15,000 | 1/week | — |

**Daily per-account cap: ~8,000 $GRIND** before diminishing returns (drops scale to 20%). This is the single most important anti-bot rail.

## Sinks (target: sinks ≥ 110% of faucets)

| Sink | Rate | Destination |
|---|---|---|
| GE fee | 2% of trade | Burn 100% |
| Smithing / crafting license | 5% of item value | Burn 50% / Treasury 50% |
| Cooking fire | 1 $GRIND / item | Burn 100% |
| Repair | 0.5% of item value per 1% durability | Burn 100% |
| Teleport | 20–200 | Burn 100% |
| PvP death drop | 30% | Burn 100% |
| NFT mint fee | 5,000 | Burn 80% / Treasury 20% |
| Territory upkeep | 50,000 / week / claim | Treasury |
| Respec | 10,000 | Burn 100% |
| Cosmetic shop | Variable | Treasury |

## Equilibrium (10k DAU, year 2)

Emission budget: 191k/day.

Player behavior: 10k × 2h × ~800/h avg = 16M/day gross earn theoretical, but emission cap binds. Server scales drops via a global `emission_rate_multiplier` that targets today's budget. Players see this as a "Grind Rate: 87%" HUD number — transparent.

Sinks at 10k DAU:
- GE fees: 100k burn
- Crafting / repair: 300k burn
- Teleport / food / misc: 500k burn
- PvP burn: 6k burn
- **Total: ~906k/day sink**

Net: emission 191k − sink 906k = **−715k/day deflationary**. Healthy.

## Anti-P2W rails

- Gear requires crafting from materials, which requires skilling.
- Buying materials shortcuts time, not the XP ladder.
- Leaderboards are XP-based, not wealth-based.
- No premium account tiers. No gacha.
- Cosmetics-only for pure-cash items.

## Failure modes

| Risk | Signal | Response |
|---|---|---|
| Hyperinflation | Price down, inventory bloat | Raise GE fee, add event sinks |
| Hyperdeflation | Thin GE, player complaints | Treasury buybacks via quest rewards |
| Bot farming | Emission exhausts early each day | Tighten IP caps, raise withdraw captcha |
| Pump/dump | Price thrash | Treasury counter-liquidity bands |
| Whale concentration | >5% single address | Publish dashboard, whale-tax on large trades |

## Treasury rules

- Multisig 3-of-5 (team + 2 community seats added season 3).
- No discretionary sells.
- Usage limited to: season prize payouts, rules-based counter-liquidity, public ecosystem grants.
