import { DayStats, Economy, PlayerCohort } from "./model.js";
import { dailyEmissionBudget, yearForDay } from "./emission.js";
import { computeDailySinks } from "./sinks.js";
import { playerDayEarnings, buildPopulation } from "./player.js";
import { totalBotEmission } from "./bots.js";

export interface SimConfig {
  days: number;
  dau: number;
  botFraction: number; // 0–1
}

const BASE_UNITS = 1_000_000_000n;

export function runSimulation(config: SimConfig): DayStats[] {
  const { days, dau, botFraction } = config;
  const botCount  = Math.floor(dau * botFraction);
  const humanDau  = dau - botCount;
  const population = buildPopulation(humanDau);

  const cohorts: PlayerCohort[] = ["casual", "grinder", "trader", "whale"];

  let totalEmitted = 0n;
  let totalBurned  = 0n;

  const stats: DayStats[] = [];

  for (let day = 1; day <= days; day++) {
    const year = yearForDay(day);
    const budget = dailyEmissionBudget(day);

    // --- Compute gross demand from all players + bots at multiplier=1 ---
    let grossDemand = 0n;
    for (const cohort of cohorts) {
      const count = BigInt(population[cohort]);
      grossDemand += playerDayEarnings(cohort, 1) * count;
    }
    grossDemand += totalBotEmission(botCount, 1);

    // --- Emission multiplier: scale so actual emission == budget ---
    let emissionMultiplier = 1;
    if (grossDemand > 0n && grossDemand > budget) {
      // ratio as float
      emissionMultiplier = Number(budget * 10_000n / grossDemand) / 10_000;
    }
    emissionMultiplier = Math.min(1, Math.max(0, emissionMultiplier));

    // --- Actual daily emission ---
    let dailyEmission = 0n;
    const cohortEarnings: Record<PlayerCohort, bigint> = {
      casual: 0n, grinder: 0n, trader: 0n, whale: 0n,
    };
    for (const cohort of cohorts) {
      const count = BigInt(population[cohort]);
      const perPlayer = playerDayEarnings(cohort, emissionMultiplier);
      const total = perPlayer * count;
      cohortEarnings[cohort] = total;
      dailyEmission += total;
    }
    const botEmission = totalBotEmission(botCount, emissionMultiplier);
    dailyEmission += botEmission;

    // Cap at budget (shouldn't exceed due to multiplier, but guard rounding)
    if (dailyEmission > budget) dailyEmission = budget;

    // --- Sinks ---
    const dailySinks = computeDailySinks(dau);

    totalEmitted += dailyEmission;
    totalBurned  += dailySinks;

    const circulating = totalEmitted > totalBurned ? totalEmitted - totalBurned : 0n;

    const botShareOfEmission = dailyEmission > 0n
      ? Number(botEmission * 10_000n / dailyEmission) / 10_000
      : 0;

    // cohortPnL: net of earned minus their share of sinks (proportional)
    const sinkPerPlayer = dailySinks / BigInt(dau || 1);
    const cohortPnL: Record<PlayerCohort, bigint> = {
      casual:  0n, grinder: 0n, trader: 0n, whale: 0n,
    };
    for (const cohort of cohorts) {
      const count = BigInt(population[cohort]);
      if (count === 0n) continue;
      const earned = cohortEarnings[cohort] / count;
      cohortPnL[cohort] = earned - sinkPerPlayer;
    }

    stats.push({
      day,
      year,
      dailyEmission,
      dailySinks,
      netFlow: dailyEmission - dailySinks,
      circulating,
      botShareOfEmission,
      cohortPnL,
    });
  }

  return stats;
}
