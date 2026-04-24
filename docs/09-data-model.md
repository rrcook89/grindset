# 09 — Data Model (Postgres)

Core tables. Indexes and FK constraints implied.

```sql
-- Identity

accounts (
  id              uuid PK,
  email           text UNIQUE,
  solana_wallet   text UNIQUE NULL,
  created_at      timestamptz,
  last_login_at   timestamptz,
  display_name    text,
  flags           jsonb          -- bans, warnings
)

characters (
  id              uuid PK,
  account_id      uuid FK,
  name            text UNIQUE,
  position        jsonb,         -- { zone_id, x, y }
  hp              int,
  created_at      timestamptz
)

skills (
  character_id    uuid FK,
  skill           text,          -- enum: mining, fishing, combat_melee, ...
  xp              bigint,
  PRIMARY KEY (character_id, skill)
)

-- Items

item_definitions (
  id              text PK,       -- e.g. "rune_sword"
  display_name    text,
  base_stats      jsonb,
  max_durability  int,
  stackable       bool,
  nft_eligible    bool
)

items (
  id              uuid PK,
  owner_id        uuid FK characters NULL,
  item_def_id     text FK,
  quantity        int,
  attributes      jsonb,         -- rolled stats for gear
  durability      int,
  nft_mint        text NULL,
  bound_state     text           -- in_game | nfted_in_game | nfted_withdrawn
)

bank_slots (
  account_id      uuid FK,
  slot            int,
  item_id         uuid FK,
  PRIMARY KEY (account_id, slot)
)

-- Grand Exchange

ge_orders (
  id              uuid PK,
  account_id      uuid FK,
  item_def_id     text,
  side            text,          -- buy | sell
  price_per_unit  bigint,        -- $GRIND base units
  qty_total       int,
  qty_remaining   int,
  created_at      timestamptz,
  status          text           -- open | filled | cancelled
)

ge_fills (
  id              uuid PK,
  buy_order_id    uuid FK,
  sell_order_id   uuid FK,
  price           bigint,
  qty             int,
  fee_burned      bigint,
  filled_at       timestamptz
)

-- Wallet (ledger pattern)

wallet_balances (
  account_id      uuid FK PK,
  grind_balance   bigint,        -- cached; materialized from ledger
  reserved        bigint,        -- locked in open GE orders
  updated_at      timestamptz
)

wallet_ledger (
  id              bigserial PK,
  account_id      uuid FK,
  delta           bigint,
  reason          text,          -- mob_drop | ge_buy | ge_sell | withdraw | ...
  ref_id          uuid NULL,     -- idempotency / trace
  created_at      timestamptz
)

-- Chain events

chain_events (
  sig             text PK,       -- Solana tx signature
  kind            text,          -- deposit | withdraw | mint | stake
  account_id      uuid FK,
  amount          bigint,
  processed_at    timestamptz
)

-- Quests

quest_progress (
  character_id    uuid FK,
  quest_id        text,
  state           text,          -- not_started | in_progress | complete
  data            jsonb
)

-- Chat (daily partitioned, TTL 30d)

chat_messages (
  id              bigserial,
  channel         text,
  character_id    uuid,
  body            text,
  created_at      timestamptz
)

-- Anti-cheat signals

behavior_signals (
  account_id      uuid FK,
  window          timestamptz,   -- 1-hour bucket
  action_count    int,
  click_variance  float,
  path_entropy    float,
  flag_score      int
)
```

## Conventions

- All `bigint` monetary amounts are in $GRIND base units (9 decimals; 1 $GRIND = 1,000,000,000 units).
- Ledger writes are idempotent via `ref_id`.
- `wallet_balances` is a read cache; source of truth is the sum of `wallet_ledger`. Reconcile nightly.
- Soft-delete only — we don't `DELETE` from accounts/items. Hard deletes require ops approval and leave an audit row.

## Migration tool

`apps/server/cmd/migrate` — plain SQL migrations numbered `NNN_name.up.sql` / `.down.sql` in `infra/migrations/`.
