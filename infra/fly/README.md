# GRINDSET — Fly.io deployment

## Prerequisites

- `flyctl` installed: `iwr https://fly.io/install.ps1 -useb | iex` (Windows) or `curl -L https://fly.io/install.sh | sh` (Unix)
- Logged in: `fly auth login`
- A managed Postgres + Redis. Easiest: `fly postgres create` and `upstash redis create` (Fly's marketplace).

## First-time setup

```bash
# From repo root.

# 1. Provision Postgres
fly postgres create --name grindset-db --region lhr

# 2. Create the indexer app first (so its URL is stable for Helius)
fly apps create grindset-indexer
fly secrets set -a grindset-indexer \
  DATABASE_URL="postgres://..." \
  HELIUS_API_KEY="hl_..." \
  BRIDGE_PROGRAM_ID="Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"

fly deploy --config infra/fly/indexer.fly.toml

# 3. Create the game server app
fly apps create grindset-server
fly secrets set -a grindset-server \
  DATABASE_URL="postgres://..." \
  REDIS_URL="redis://..." \
  JWT_SECRET="$(openssl rand -hex 32)" \
  AUTH_STRICT=1

# 4. Apply migrations against the deployed DB
fly proxy 5432 -a grindset-db &
DATABASE_URL=postgres://postgres:...@localhost:5432/grindset \
  go run ./apps/server/cmd/migrate up

# 5. Deploy the server
fly deploy --config infra/fly/server.fly.toml
```

## Subsequent deploys

```bash
# Server only
fly deploy --config infra/fly/server.fly.toml

# Indexer only
fly deploy --config infra/fly/indexer.fly.toml

# Both, parallel
fly deploy --config infra/fly/server.fly.toml &
fly deploy --config infra/fly/indexer.fly.toml &
wait
```

## Web client

The Vite client is a static SPA. Deploy options:

- **Cloudflare Pages** (recommended — free tier, SSL, edge cache):
  ```bash
  cd apps/web
  pnpm build
  npx wrangler pages deploy dist --project-name grindset-web
  ```
- **Fly Static**: serve `dist/` from a tiny `nginx` Dockerfile.

Set `VITE_GAME_WS_URL=wss://grindset-server.fly.dev/ws` in `.env.production` before building.

## Smoke test after deploy

```bash
# Health
curl https://grindset-server.fly.dev/healthz   # → "ok"

# WS connect (requires a JWT or AUTH_STRICT=0 for dev)
wscat -c "wss://grindset-server.fly.dev/ws?token=<jwt>"
```

## Cost notes (rough)

At MVP traffic (≤500 CCU):

| Resource | Plan | $/month |
|---|---|---|
| `grindset-server` | shared-cpu-2x / 1 GB | ~$12 |
| `grindset-indexer` | shared-cpu-1x / 512 MB | ~$5 |
| Fly Postgres | development plan | ~$15 |
| Helius RPC | free tier | $0 |
| Cloudflare Pages | free tier | $0 |
| **Total** | | **~$32/mo** |

Scale up the server VM (shared-cpu-4x → 2 GB) when CCU > 1k.

## Rollback

```bash
fly releases -a grindset-server
fly releases rollback <version> -a grindset-server
```

## Environment variables (full list)

### grindset-server

| Var | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Postgres DSN |
| `REDIS_URL` | yes | sessions, presence |
| `NATS_URL` | optional | zone handoff at scale |
| `HTTP_ADDR` | no | default `:8080` |
| `TICK_MS` | no | default `400` |
| `JWT_SECRET` | yes | 32+ random bytes |
| `AUTH_STRICT` | yes for prod | `1` to disable dev_user fallback |
| `GAME_SIGNER_KEYPAIR` | yes for withdraw | path or inline JSON of ed25519 keypair |

### grindset-indexer

| Var | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | same DB as server |
| `HELIUS_API_KEY` | yes | RPC + webhook |
| `BRIDGE_PROGRAM_ID` | yes | from `anchor build` output |
| `HTTP_ADDR` | no | default `:8081` |
