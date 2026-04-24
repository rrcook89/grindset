import { BASE_UNITS, DAILY_CAP_GRIND } from "./faucets.js";

/**
 * A bot hits the faucet cap each day (max combat_t3 until capped),
 * then attempts to withdraw. After the cap, diminishing returns apply,
 * so the effective earning is capped at DAILY_CAP_GRIND + small overflow.
 *
 * The cap is the primary anti-bot rail per spec.
 */
export function botDayEarnings(emissionMultiplier: number): bigint {
  // Bots run combat_t3 at 2400/hr. After ~3.3 hrs they hit the 8k cap.
  // They still run 24hr so they collect a small tail via 20% diminishing returns.
  const cap = DAILY_CAP_GRIND;
  // Additional hours after cap: ~20.7 hrs * 2400/hr * 0.20 = 9936, but emission
  // multiplier applies to the gross, so cap binding means we model them as earning
  // the cap amount exactly (server caps at cap before multiplier can bypass it).
  const earned = cap * emissionMultiplier;
  return BigInt(Math.floor(earned)) * BASE_UNITS;
}

/**
 * Total bot emission captured per day in base units.
 */
export function totalBotEmission(botCount: number, emissionMultiplier: number): bigint {
  const perBot = botDayEarnings(emissionMultiplier);
  return perBot * BigInt(botCount);
}
