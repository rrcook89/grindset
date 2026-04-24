# @grindset/tokenomics-sim

CLI simulator for the GRINDSET $GRIND economy. Models player cohorts, bot
behavior, emission schedule, and sinks day-by-day.

## Setup

```
pnpm install
pnpm run build
```

## Run

```
pnpm run -- --days 730 --dau 10000
pnpm run -- --days 365 --dau 1000 --bots 2%
```

Arguments:

| Flag | Default | Description |
|------|---------|-------------|
| `--days` | 365 | Number of days to simulate |
| `--dau`  | 10000 | Daily active users |
| `--bots` | 5% | Bot share of DAU (e.g. `5%` or `0.05`) |

CSV output goes to **stdout**; the summary JSON goes to **stderr**.

```
pnpm run -- --days 730 --dau 10000 > out.csv
```

## Test

```
pnpm test
```

Tests verify:
- Emission schedule sums to exactly 400M $GRIND.
- Sinks grow with DAU.
- Bot earnings are capped at the daily cap.
- At 10k DAU / 5% bots, year 2 is net deflationary (sinks > emission).
