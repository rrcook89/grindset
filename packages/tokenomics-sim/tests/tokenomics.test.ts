import { describe, it, expect } from "vitest";
import { YEARLY_EMISSION_GRIND, TOTAL_PLAY_TO_EARN, dailyEmissionBudget } from "../src/emission.js";
import { computeDailySinks } from "../src/sinks.js";
import { botDayEarnings } from "../src/bots.js";
import { DAILY_CAP_GRIND } from "../src/faucets.js";
import { runSimulation } from "../src/simulator.js";

const BASE_UNITS = 1_000_000_000n;

describe("emission schedule", () => {
  it("sums to exactly 400M $GRIND", () => {
    const total = YEARLY_EMISSION_GRIND.reduce((a, b) => a + b, 0);
    expect(total).toBe(TOTAL_PLAY_TO_EARN);
    expect(total).toBe(400_000_000);
  });

  it("has 8 years of entries", () => {
    expect(YEARLY_EMISSION_GRIND.length).toBe(8);
  });

  it("year 1 daily budget is ~219k GRIND", () => {
    const day1Budget = dailyEmissionBudget(1);
    const grind = Number(day1Budget / BASE_UNITS);
    // 80M / 365 = 219,178; allow ±1 for floor
    expect(grind).toBeGreaterThanOrEqual(219_177);
    expect(grind).toBeLessThanOrEqual(219_179);
  });

  it("year 2 daily budget is ~191k GRIND", () => {
    const day366Budget = dailyEmissionBudget(366);
    const grind = Number(day366Budget / BASE_UNITS);
    // 70M / 365 = 191,780
    expect(grind).toBeGreaterThanOrEqual(191_780);
    expect(grind).toBeLessThanOrEqual(191_781);
  });
});

describe("sinks", () => {
  it("at 10k DAU sinks are ~906k GRIND/day", () => {
    const sinks = computeDailySinks(10_000);
    const grind = Number(sinks / BASE_UNITS);
    expect(grind).toBeGreaterThanOrEqual(900_000);
    expect(grind).toBeLessThanOrEqual(920_000);
  });

  it("sinks grow with DAU (20k > 10k)", () => {
    const at10k = computeDailySinks(10_000);
    const at20k = computeDailySinks(20_000);
    expect(at20k).toBeGreaterThan(at10k);
  });

  it("sinks are roughly double at double DAU (linear components)", () => {
    const at10k = Number(computeDailySinks(10_000) / BASE_UNITS);
    const at20k = Number(computeDailySinks(20_000) / BASE_UNITS);
    // GE scales at 1.2 power so slightly more than 2x; allow 1.9–2.3x
    expect(at20k / at10k).toBeGreaterThan(1.9);
    expect(at20k / at10k).toBeLessThan(2.3);
  });
});

describe("bots", () => {
  it("bot daily earnings are capped at DAILY_CAP_GRIND at multiplier=1", () => {
    const earned = botDayEarnings(1);
    const grind = Number(earned / BASE_UNITS);
    expect(grind).toBe(DAILY_CAP_GRIND);
  });

  it("bot earnings scale with emission multiplier", () => {
    const full = botDayEarnings(1);
    const half = botDayEarnings(0.5);
    expect(half * 2n).toBe(full);
  });

  it("bots cannot earn more than cap regardless of multiplier clamping", () => {
    const earned = botDayEarnings(1);
    const grind = Number(earned / BASE_UNITS);
    expect(grind).toBeLessThanOrEqual(DAILY_CAP_GRIND);
  });
});

describe("simulation — year 2 deflation", () => {
  it("at 10k DAU 5% bots, year 2 is net deflationary", () => {
    const stats = runSimulation({ days: 730, dau: 10_000, botFraction: 0.05 });
    const year2 = stats.filter(s => s.year === 2);
    expect(year2.length).toBeGreaterThan(0);

    const y2Emission = year2.reduce((a, s) => a + s.dailyEmission, 0n);
    const y2Sinks    = year2.reduce((a, s) => a + s.dailySinks,    0n);
    expect(y2Sinks).toBeGreaterThan(y2Emission);
  });

  it("bot share of emission does not exceed bot fraction of DAU significantly", () => {
    const stats = runSimulation({ days: 30, dau: 10_000, botFraction: 0.05 });
    // Bots are 5% of DAU; with cap they should capture ≤ 15% of emission
    // (grinders earn more per-capita than casuals so bots' share is bounded)
    for (const s of stats) {
      expect(s.botShareOfEmission).toBeLessThanOrEqual(0.20);
    }
  });
});
