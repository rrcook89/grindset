import { runSimulation } from "./simulator.js";
import { DayStats } from "./model.js";

function parseArgs(): { days: number; dau: number; botFraction: number } {
  const args = process.argv.slice(2);
  let days = 365;
  let dau  = 10_000;
  let botFraction = 0.05;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--days" && args[i + 1]) {
      days = parseInt(args[++i], 10);
    } else if (args[i] === "--dau" && args[i + 1]) {
      dau = parseInt(args[++i], 10);
    } else if (args[i] === "--bots" && args[i + 1]) {
      const raw = args[++i];
      botFraction = raw.endsWith("%")
        ? parseFloat(raw) / 100
        : parseFloat(raw);
    }
  }
  return { days, dau, botFraction };
}

function fmtGrind(baseUnits: bigint): string {
  const whole = baseUnits / 1_000_000_000n;
  return whole.toLocaleString();
}

function toCSV(stats: DayStats[]): string {
  const header = "day,year,emission_grind,sinks_grind,net_flow_grind,circulating_grind,bot_share_pct";
  const rows = stats.map(s =>
    [
      s.day,
      s.year,
      (s.dailyEmission / 1_000_000_000n).toString(),
      (s.dailySinks    / 1_000_000_000n).toString(),
      (s.netFlow       / 1_000_000_000n).toString(),
      (s.circulating   / 1_000_000_000n).toString(),
      (s.botShareOfEmission * 100).toFixed(2),
    ].join(",")
  );
  return [header, ...rows].join("\n");
}

function summarize(stats: DayStats[], dau: number, botFraction: number) {
  const totalEmission = stats.reduce((a, s) => a + s.dailyEmission, 0n);
  const totalSinks    = stats.reduce((a, s) => a + s.dailySinks,    0n);
  const netFlow       = totalEmission - totalSinks;
  const final         = stats[stats.length - 1];

  // Year 2 deflation check (days 366–730)
  const year2Stats = stats.filter(s => s.year === 2);
  let year2Deflationary = false;
  if (year2Stats.length > 0) {
    const y2Emission = year2Stats.reduce((a, s) => a + s.dailyEmission, 0n);
    const y2Sinks    = year2Stats.reduce((a, s) => a + s.dailySinks,    0n);
    year2Deflationary = y2Sinks > y2Emission;
  }

  const summary = {
    config: { days: stats.length, dau, bot_pct: (botFraction * 100).toFixed(1) + "%" },
    totals: {
      emission_grind:    fmtGrind(totalEmission),
      sinks_grind:       fmtGrind(totalSinks),
      net_flow_grind:    fmtGrind(netFlow < 0n ? -netFlow : netFlow) + (netFlow < 0n ? " (deflationary)" : " (inflationary)"),
      final_circulating: fmtGrind(final.circulating),
    },
    year2_deflation: year2Deflationary
      ? "PASS — sinks > emission in year 2"
      : year2Stats.length === 0
        ? "N/A — sim did not reach year 2"
        : "WARNING: sinks < emission in year 2; model may be miscalibrated",
  };

  if (!year2Deflationary && year2Stats.length > 0) {
    console.error("\n*** WARNING: year 2 is NOT deflationary at this DAU/bot level. Check model calibration. ***\n");
  }

  return summary;
}

async function main() {
  const { days, dau, botFraction } = parseArgs();

  console.error(`Running simulation: ${days} days, ${dau} DAU, ${(botFraction * 100).toFixed(1)}% bots`);

  const stats = runSimulation({ days, dau, botFraction });

  // CSV to stdout
  process.stdout.write(toCSV(stats) + "\n");

  // Summary JSON to stderr so CSV can be piped cleanly
  const summary = summarize(stats, dau, botFraction);
  console.error("\n=== Summary ===");
  console.error(JSON.stringify(summary, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
