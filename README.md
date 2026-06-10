# Arena

A browser-based multiplayer arena RPG. Authoritative real-time server (Colyseus) with a
React Three Fiber client, organized as a pnpm + TypeScript monorepo.

## Stack

| Layer   | Tech                                                              |
| ------- | ----------------------------------------------------------------- |
| Client  | React 18, Vite 5, React Three Fiber, drei, Zustand, `colyseus.js` |
| Server  | Node.js 20, TypeScript, Colyseus 0.15 (authoritative simulation)  |
| Shared  | TypeScript types, message contracts, and world constants          |
| Tooling | pnpm workspaces, ESLint 9 (flat), Prettier 3, Docker / Compose    |

## Layout

```
arena/
├── apps/
│   ├── client/            # Vite + React Three Fiber front end
│   │   └── src/
│   │       ├── network/   # colyseus.js connection + state sync
│   │       ├── store/     # Zustand store
│   │       ├── scene/     # R3F scene (arena, players, camera)
│   │       ├── hooks/     # keyboard input
│   │       └── ui/        # join screen + HUD
│   └── server/            # Colyseus game server
│       └── src/rooms/     # ArenaRoom + authoritative schema
├── packages/
│   └── shared/            # @arena/shared — types, messages, constants
├── docker-compose.yml
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── eslint.config.js
```

## Architecture

- **The server is authoritative.** Clients send normalized movement _intent_
  (`ClientMessage.Move`); `ArenaRoom` integrates it on a fixed 20 Hz timestep and
  replicates state via Colyseus schema sync.
- **`@arena/shared` carries the contract** — plain types, message enums, and tunable
  constants. It has no `@colyseus/schema` dependency, so the same definitions compile
  cleanly for both the browser and Node without decorator build friction. The server's
  decorated schema (`apps/server/src/rooms/schema.ts`) mirrors `PlayerView` / `ArenaStateView`.
- **The client renders without per-frame React churn.** Snapshots land in a non-reactive
  `Map` inside the Zustand store; player meshes read it imperatively in `useFrame` and
  interpolate. React only re-renders when the _set_ of players changes.

## Prerequisites

- Node.js >= 20 (`.nvmrc` pins 20)
- pnpm >= 10 (`corepack enable` will provide it)

## Install

```bash
corepack enable
pnpm install
```

## Develop

```bash
# Build the shared package once, then run client + server + shared (watch) together:
pnpm dev
```

- Client: http://localhost:5173
- Server: ws://localhost:2567 (Colyseus monitor at http://localhost:2567/monitor)

Copy `apps/client/.env.example` to `apps/client/.env` to override `VITE_SERVER_URL`.

Run a single workspace:

```bash
pnpm --filter @arena/server dev
pnpm --filter @arena/client dev
```

## Quality

```bash
pnpm typecheck     # tsc project references across all packages
pnpm lint          # ESLint (flat config)
pnpm format        # Prettier write
```

## Build

```bash
pnpm build         # shared → server → client
```

## Docker

```bash
docker compose up --build
```

- Client (nginx): http://localhost:8080
- Server: ws://localhost:2567

## Next steps

This is a working starter, not a finished game. Natural follow-ups:

- Client-side prediction + server reconciliation for the local player
- Combat (the `ServerMessage.Damage` contract and `hp`/`alive` fields are already wired)
- Persistence / matchmaking via `@colyseus/tools` and a Redis presence driver

```

```
