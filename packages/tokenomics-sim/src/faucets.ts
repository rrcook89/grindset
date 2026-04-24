// Faucet rates from docs/04-tokenomics.md
// All rates in $GRIND per hour (whole units).

export const FAUCET_RATES = {
  mining:       320,   // 0.8/action * 400 actions/hr
  fishing:      300,   // 0.6/action * 500 actions/hr
  woodcutting:  250,   // 0.5/action * 500 actions/hr
  combat_t1:    750,   // ~3–8 drop * 150/hr
  combat_t3:    2_400, // ~20–40 drop * 80/hr
  daily_quest:  1_250, // midpoint of 500–2000, once/day
  weekly_quest: 10_000,// midpoint of 5000–15000, once/week
} as const;

/** Hard per-account daily cap in whole $GRIND before 80% diminishing returns. */
export const DAILY_CAP_GRIND = 8_000;

export const BASE_UNITS = 1_000_000_000n;

/**
 * Compute how much $GRIND a player earns in a day given hours spent on each
 * activity. Returns base units. Applies the daily cap + 20% diminishing returns.
 *
 * @param hoursPerActivity  map of activity -> hours spent
 * @param emissionMultiplier  server-side scalar (0–1) to hit budget
 */
export function computeDayEarnings(
  hoursPerActivity: Partial<Record<keyof typeof FAUCET_RATES, number>>,
  emissionMultiplier: number,
): bigint {
  let gross = 0;
  for (const [activity, hours] of Object.entries(hoursPerActivity)) {
    const rate = FAUCET_RATES[activity as keyof typeof FAUCET_RATES] ?? 0;
    gross += rate * (hours as number);
  }
  gross *= emissionMultiplier;

  let net: number;
  if (gross <= DAILY_CAP_GRIND) {
    net = gross;
  } else {
    net = DAILY_CAP_GRIND + (gross - DAILY_CAP_GRIND) * 0.2;
  }

  return BigInt(Math.floor(net)) * BASE_UNITS;
}
