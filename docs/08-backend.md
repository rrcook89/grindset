# 08 — Backend Architecture

## Topology

```
                        ┌──────────────┐
                        │  Cloudflare  │ (DDoS, CDN, WS passthrough)
                        └──────┬───────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
   ┌─────▼──────┐       ┌──────▼──────┐       ┌─────▼──────┐
   │ Gateway    │       │ Game Zone   │       │ Web API    │
   │ (Go, WS)   │       │ Workers (Go)│       │ (Go, HTTP) │
   │ auth+route │       │ 1 per zone  │       │ GE, bank,  │
   └─────┬──────┘       └──────┬──────┘       │ profile    │
         │                     │              └─────┬──────┘
         │        ┌────────────┼──────────────────  ┤
         │        │            │                    │
  ┌──────▼────┐   │     ┌──────▼───────┐    ┌──────▼──────┐
  │ Redis     │   │     │ PostgreSQL   │    │ NATS        │
  │ presence  │   │     │ persistent   │    │ pubsub      │
  └───────────┘   │     └──────────────┘    └─────────────┘
                  │
             ┌────▼────────┐          ┌──────────────────┐
             │ Indexer(Go) │◄─────────┤ Helius webhook   │
             └─────────────┘          └──────────────────┘
```

## Stack

- **Language:** Go 1.22
- **DB:** Postgres 16 (primary + 2 read replicas at scale)
- **Hot state:** Redis 7
- **Messaging:** NATS (zone handoff, chat fanout, events)
- **Wire:** WebSocket binary protocol
- **Deploy:** Fly.io (global regions)

## Zone worker

Each zone is a single Go process owning:
- A 128×128 tile grid (or 2–4 grids for larger zones).
- All entities currently in it (players, mobs, dropped items).
- One goroutine for the tick loop (400ms cadence).
- Goroutine-per-connection for inbound reads; tick loop owns writes.

### Tick loop

```go
for tick := range ticker.C {
    zone.ProcessIntents()     // drain player command queue
    zone.ResolveMovement()
    zone.ResolveCombat()
    zone.ResolveSkilling()
    zone.TickMobs()           // AI, respawns
    zone.TickWorld()          // loot, item decay, nodes
    zone.BroadcastDeltas()    // only to viewport-relevant clients
    if tick % 10 == 0 {
        zone.SnapshotToDB()   // flush every 4s
    }
}
```

### Interest management

Clients only receive updates for entities within their viewport + small buffer. Keeps bandwidth under 5 KB/s per player.

### Zone handoff

1. Player walks to edge tile.
2. Source zone emits `TransferRequest` via NATS.
3. Target zone acks, loads player state from Postgres (or accepts inline from source).
4. Gateway re-routes WS connection to target zone.
5. Source removes player; client sees a half-tick stutter hidden by brief fade.

## Persistence strategy

- **Write-through** (trades, deaths, item creation): Postgres sync, block on success.
- **Snapshot** (XP, inventory, position): in-memory truth, flushed every 4s. Power loss = up to 4s lost.
- **Redis hot state:** sessions, online-players list, rate-limit counters, WS connection → zone map.
- **Ledger pattern** for all wallet movement: immutable inserts; balance is a materialized view. Simplifies audit, dispute, rollback.

## Capacity

| Metric | Target |
|---|---|
| CCU per zone worker | ~150 |
| CCU per gateway instance | ~5,000 WS |
| CCU at MVP | 500 |
| CCU at growth | 10,000+ |

Scale by adding zone workers (each zone = one worker). Gateway scales horizontally, stateless.

## Wire protocol

Binary over WS. JSON is too fat for 400ms ticks.

```
[u8 opcode][u8 flags][u16 length][payload...]
```

Payload: bit-packed or MessagePack. ~50–200 bytes/tick/player downstream.

Opcode ranges:
- `0x00–0x0F` auth/session
- `0x10–0x2F` movement
- `0x30–0x4F` combat
- `0x50–0x6F` skilling
- `0x70–0x8F` inventory/trade
- `0x90–0x9F` chat
- `0xA0–0xAF` wallet/economy
- `0xF0–0xFF` system/error

Full opcode table lives in `packages/protocol/`.

## Observability

- **Metrics:** Prometheus scrape of each service.
- **Logs:** Loki, structured JSON via slog.
- **Traces:** OpenTelemetry, Tempo backend (optional at MVP).
- **Dashboards:** Grafana — CCU, ticks/sec, emission-vs-budget, burn rate, drop-rate multiplier.
