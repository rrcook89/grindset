# indexer

Standalone Go service that listens for Bridge program events on Solana and
writes them to Postgres idempotently.

## Modes

| Mode | Condition | Description |
|---|---|---|
| Helius webhook | `HELIUS_API_KEY` is set | Listens on `:8081/webhook` for Helius enhanced-transaction POSTs |
| RPC polling | `HELIUS_API_KEY` unset | Polls `getSignaturesForAddress` every 5 s against `SOLANA_RPC_URL` |

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | Postgres DSN (`postgres://user:pass@host/db`) |
| `BRIDGE_PROGRAM_ID` | Yes | — | Base-58 address of the deployed Bridge program |
| `HELIUS_API_KEY` | No | — | If set, enables webhook mode (register `:8081/webhook` in the Helius dashboard) |
| `SOLANA_RPC_URL` | No | `http://127.0.0.1:8899` | Solana JSON-RPC endpoint used in polling mode |

## Build & run

```sh
cd apps/indexer
go build ./...
go test ./...

# Docker
docker build -t grindset/indexer .
docker run \
  -e DATABASE_URL=postgres://... \
  -e BRIDGE_PROGRAM_ID=Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS \
  -e HELIUS_API_KEY=your-key \
  -p 8081:8081 \
  grindset/indexer
```

## Database tables

The indexer writes to tables defined in the migrations:

- `chain_events` — one row per confirmed transaction signature (PK = `sig`).
- `wallet_ledger` — one row per deposit event (idempotent on `ref_id`).
- `indexer_cursor` — one row per program, tracking the last processed signature
  and slot (`013_indexer_state`).

## Idempotency

Both `chain_events` and `wallet_ledger` use `ON CONFLICT DO NOTHING`.
Duplicate Helius webhook deliveries or polling overlaps are safe.

## Event discriminators

Anchor emits events as `Program data: <base64(discriminator || borsh_payload)>`.
The discriminator is `sha256("event:<TypeName>")[:8]`.  The known values are
hard-coded in `internal/parser/parser.go`; regenerate them if event struct
names change by running:

```sh
echo -n "event:DepositEvent"  | sha256sum | cut -c1-16
echo -n "event:WithdrawEvent" | sha256sum | cut -c1-16
```
