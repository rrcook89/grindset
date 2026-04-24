export type PlayerCohort = "casual" | "grinder" | "trader" | "whale";

export interface Player {
  cohort: PlayerCohort;
  /** Accumulated $GRIND in base units (9 decimals) */
  balance: bigint;
  /** Total earned this day (for cap tracking) */
  earnedToday: bigint;
}

export interface Economy {
  /** Day number (1-based) */
  day: number;
  /** Year number (1-based) */
  year: number;
  /** Total $GRIND emitted so far (base units) */
  totalEmitted: bigint;
  /** Total $GRIND burned so far (base units) */
  totalBurned: bigint;
  /** Net circulating = emitted - burned */
  circulating: bigint;
  /** Global emission rate multiplier (0–1) applied by server to hit daily budget */
  emissionMultiplier: number;
}

export interface DayStats {
  day: number;
  year: number;
  dailyEmission: bigint;
  dailySinks: bigint;
  netFlow: bigint;           // emission - sinks (negative = deflationary)
  circulating: bigint;
  botShareOfEmission: number; // fraction 0–1
  cohortPnL: Record<PlayerCohort, bigint>;
}
