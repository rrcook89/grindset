# 10 — Anti-Bot & Anti-Cheat

## Layered detection

### Layer 1 — Structural (zero cost)

- Per-action cooldowns enforced server-side.
- Per-account daily faucet cap (~8,000 $GRIND, then 20% drops).
- Per-IP connection caps.
- Zone node cooldowns (same rock can't be rehit).
- Server-authoritative everything — no client trust.

### Layer 2 — Behavioral (cheap ML)

Per `behavior_signals` table:

- **Click cadence variance:** humans fluctuate, bots don't.
- **Path entropy:** humans take slightly-off-optimal routes.
- **Session shape:** humans break. Bots don't.
- **Input timing autocorrelation:** bots have frequency signatures.

Compute hourly, score the account, threshold to flag.

### Layer 3 — Economic

- Accounts under 48h cannot trade $GRIND off-platform.
- First withdraw gated on N hours played + captcha.
- Wallet-flow anomaly detection (100 accounts funneling to 1 wallet = farm).
- Withdraw concentration alerts.

### Layer 4 — Chain forensics

- Cluster on-chain wallet graph. Identify farm operators.
- Public label list of known farm wallets → trade restrictions.

## Response gradient

Don't hard-ban on first flag. Escalate:

1. **Soft-throttle** — drop rates silently halved. Farmer thinks hardware is fine; farm economics break.
2. **Withdraw freeze** — play OK, can't cash out.
3. **Shadow-ban** — character in isolated shard, can't affect real economy.
4. **Hard ban + chain-label** — account nuked, linked wallets flagged publicly.

Soft responses at scale are cheaper and harder to dodge than hard bans.

## Sybil resistance

- One free account per device + optional wallet-tie.
- Extra accounts require small $GRIND stake. Stake slashes on ToS violation.
- Node cooldowns per-account (not per-character) to block multi-accounting.
- First 30 days: no direct player-to-player $GRIND transfer outside GE. Kills RMT mules.

## Incident playbook

**Item dupe discovered:**
1. Pause GE trading (reversible).
2. Investigate ledger for impacted items.
3. Roll back specific ledger entries (ledger pattern makes this clean).
4. Resume trading.
5. Public post-mortem.

**Server compromise:**
1. Rotate `game_signer` on Bridge program (multisig).
2. Halt withdrawals temporarily.
3. Bridge circuit breaker (`max_withdraw_per_epoch`) bounds damage.
4. Audit full server / host stack.
5. Public post-mortem.

## Rate limits (starting values)

| Event | Limit |
|---|---|
| Login attempts | 10/hr per IP |
| New account creation | 3/day per IP |
| GE order placement | 30/min per account |
| Chat messages | 10/min per channel |
| Withdraw | 1/hr per account, ≤ 25% of balance |

Tunable in `infra/config/rate_limits.toml`.

## What we don't do

- No mandatory KYC to play.
- No hardware fingerprinting beyond what's needed.
- No anti-cheat that reads non-game memory.
- No chat content AI moderation beyond keyword filter + user reports (human mods do real review).
