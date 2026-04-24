import { PlayerCohort } from "./model.js";
import { computeDayEarnings, DAILY_CAP_GRIND, BASE_UNITS } from "./faucets.js";

export interface CohortConfig {
  hoursPerDay: number;
  skillingFraction: number; // rest goes to combat_t1
  allGE?: boolean;          // trader: no direct earning, small passive
  buyMats?: boolean;        // whale: buys mats, crafts, sells
}

export const COHORT_CONFIGS: Record<PlayerCohort, CohortConfig> = {
  casual:  { hoursPerDay: 1,   skillingFraction: 0.6 },
  grinder: { hoursPerDay: 4,   skillingFraction: 0.3 },
  trader:  { hoursPerDay: 0.5, skillingFraction: 0,   allGE: true },
  whale:   { hoursPerDay: 1,   skillingFraction: 0,   buyMats: true },
};

/**
 * Returns gross $GRIND earned by one player of given cohort in one day.
 * Whales spend to craft and sell, netting ~2x on mats but paying crafting sink.
 * Traders earn only via GE spread; modeled as a small flat passive.
 */
export function playerDayEarnings(
  cohort: PlayerCohort,
  emissionMultiplier: number,
): bigint {
  const cfg = COHORT_CONFIGS[cohort];

  if (cfg.allGE) {
    // Traders earn via spread arbitrage — modeled as 200 $GRIND/day passive
    return BigInt(Math.floor(200 * emissionMultiplier)) * BASE_UNITS;
  }

  if (cfg.buyMats) {
    // Whales buy mats, craft, sell. Net earn after crafting sink ~500/day.
    return BigInt(Math.floor(500 * emissionMultiplier)) * BASE_UNITS;
  }

  const hours = cfg.hoursPerDay;
  const skillingHours = hours * cfg.skillingFraction;
  const combatHours   = hours * (1 - cfg.skillingFraction);

  // Split skilling 50/50 mining+woodcutting for variety
  return computeDayEarnings(
    {
      mining:      skillingHours * 0.5,
      woodcutting: skillingHours * 0.5,
      combat_t1:   combatHours,
    },
    emissionMultiplier,
  );
}

/** Population mix: returns count per cohort given total DAU and optional overrides. */
export function buildPopulation(
  dau: number,
  mix: Partial<Record<PlayerCohort, number>> = {},
): Record<PlayerCohort, number> {
  // Defaults: 55% casual, 30% grinder, 10% trader, 5% whale
  const defaults: Record<PlayerCohort, number> = {
    casual:  0.55,
    grinder: 0.30,
    trader:  0.10,
    whale:   0.05,
  };
  const fractions = { ...defaults, ...mix };
  return {
    casual:  Math.floor(dau * fractions.casual),
    grinder: Math.floor(dau * fractions.grinder),
    trader:  Math.floor(dau * fractions.trader),
    whale:   Math.floor(dau * fractions.whale),
  };
}
