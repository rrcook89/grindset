// Sink model from docs/04-tokenomics.md
// Equilibrium at 10k DAU year 2:
//   GE fees:          100k/day
//   Crafting/repair:  300k/day
//   Teleport/food:    500k/day
//   PvP:              6k/day
//   Total:            ~906k/day

const BASE_UNITS = 1_000_000_000n;

// These are calibrated at 10k DAU. Scale linearly with DAU.
const REFERENCE_DAU = 10_000;

// $GRIND/day at reference DAU (whole units)
const SINK_GE_FEES_REF       = 100_000;
const SINK_CRAFTING_REP_REF  = 300_000;
const SINK_TELEPORT_FOOD_REF = 500_000;
const SINK_PVP_REF           =   6_000;

const TOTAL_SINK_REF = SINK_GE_FEES_REF + SINK_CRAFTING_REP_REF + SINK_TELEPORT_FOOD_REF + SINK_PVP_REF;

/**
 * Total daily sinks in base units for given DAU.
 * GE fees scale super-linearly with volume (volume ~ DAU^1.2), others linear.
 */
export function computeDailySinks(dau: number): bigint {
  const ratio = dau / REFERENCE_DAU;
  // GE volume scales ~quadratically with more traders (more pairs = more trades)
  const geScale = Math.pow(ratio, 1.2);
  const linearScale = ratio;

  const total =
    SINK_GE_FEES_REF       * geScale +
    SINK_CRAFTING_REP_REF  * linearScale +
    SINK_TELEPORT_FOOD_REF * linearScale +
    SINK_PVP_REF           * linearScale;

  return BigInt(Math.floor(total)) * BASE_UNITS;
}
