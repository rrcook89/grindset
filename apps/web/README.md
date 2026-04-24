# grindset-web

Browser client for GRINDSET — Sprint 1 walking skeleton.

## Quick start

```bash
pnpm install
pnpm dev        # http://localhost:5173
```

## Scripts

| Command        | What it does                          |
| -------------- | ------------------------------------- |
| `pnpm dev`     | Vite dev server on :5173              |
| `pnpm build`   | TypeScript check + production bundle  |
| `pnpm preview` | Serve the production build locally    |
| `pnpm test`    | Vitest (watch mode)                   |
| `pnpm lint`    | ESLint — zero warnings policy         |
| `pnpm fmt`     | Prettier format                       |

## Environment

Copy `.env.example` to `.env.local` and adjust:

```
VITE_GAME_WS_URL=ws://localhost:8080/ws
```

The dev mode connects as `player1`. Sprint 2 wires in real auth.

## Sprint 1 stubs / TODOs

- `DEV_USER` in `App.tsx` — hard-coded; replace with auth in Sprint 2.
- `PriceTicker` — shows `$0.00`; wire to on-chain price feed in Sprint 6.
- `ChatDock` — input disabled; global chat in Sprint 2.
- `Hotbar` — placeholder slots; items in Sprint 3.
- No wallet connect — Sprint 6.
- Asset manifest (`public/assets/manifest.json`) — Sprint 3 when real art lands.
