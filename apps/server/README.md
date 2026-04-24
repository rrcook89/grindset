# grindset/server

Go game server. Sprint 1 walking skeleton: WebSocket, 50×50 zone, tick loop, multiplayer walking.

## Run

```bash
cd apps/server
go mod tidy           # first time
go run ./cmd/server
```

Server starts on `:8080`. Connect with `ws://localhost:8080/ws?dev_user=<name>`.

No database is required for Sprint 1 — if `DATABASE_URL` is unset or unreachable, the server logs a warning and continues.

## Migrate

```bash
export DATABASE_URL=postgres://grindset:grindset@localhost:5432/grindset_dev?sslmode=disable
go run ./cmd/migrate up
go run ./cmd/migrate down   # rolls back the most recent migration
```

Override migrations dir with `MIGRATIONS_DIR`. Default is `../../infra/migrations` (relative to this package).

## Test

```bash
go test ./...
```

## Structure

```
cmd/
  server/     WS + tick loop entrypoint
  migrate/    SQL migration runner
internal/
  auth/       Sprint 1 dev_user stub (replaces Sprint 2)
  config/     env config
  db/         pgx pool
  gateway/    WS upgrade + per-connection read/write loops
  log/        slog JSON handler
  protocol/   binary opcode codec + round-trip tests
  zone/       zone state, tick loop, movement, broadcast
```

## Protocol

See [../../packages/protocol/opcodes.md](../../packages/protocol/opcodes.md).

## Env

See `.env.example`.
