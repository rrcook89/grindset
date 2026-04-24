// Emission schedule from docs/04-tokenomics.md
// Play-to-earn pool: 400,000,000 $GRIND over 8 years.
// All values in whole $GRIND; multiply by 1e9 for base units.

export const YEARLY_EMISSION_GRIND: readonly number[] = [
  80_000_000, // year 1
  70_000_000, // year 2
  60_000_000, // year 3
  50_000_000, // year 4
  40_000_000, // year 5
  35_000_000, // year 6
  35_000_000, // year 7
  30_000_000, // year 8
];

export const TOTAL_PLAY_TO_EARN = 400_000_000;

const BASE_UNITS = 1_000_000_000n;

/** Daily emission budget in base units for a given day number (1-based). */
export function dailyEmissionBudget(day: number): bigint {
  const year = Math.min(Math.ceil(day / 365), 8);
  const annualGrind = YEARLY_EMISSION_GRIND[year - 1];
  // Use exact 365-day years (matches the spec table)
  const dailyGrind = annualGrind / 365;
  return BigInt(Math.floor(dailyGrind)) * BASE_UNITS;
}

/** Year number for a given day (1-based). */
export function yearForDay(day: number): number {
  return Math.min(Math.ceil(day / 365), 8);
}
