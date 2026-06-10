import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { monitor } from '@colyseus/monitor';
import { ARENA_ROOM, TOWN_ROOM } from '@arena/shared';
import { ArenaRoom } from './rooms/ArenaRoom.js';
import { TownRoom } from './rooms/TownRoom.js';

const PORT = Number(process.env.PORT ?? 2567);
const HOST = process.env.HOST ?? '0.0.0.0';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Colyseus dashboard for inspecting live rooms (dev/ops only).
app.use('/monitor', monitor());

const httpServer = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define(TOWN_ROOM, TownRoom);
gameServer.define(ARENA_ROOM, ArenaRoom);

gameServer
  .listen(PORT, HOST)
  .then(() => {
    console.log(`⚔️  Arena server listening on ws://${HOST}:${PORT}`);
    console.log(`📊  Monitor available at http://${HOST}:${PORT}/monitor`);
  })
  .catch((err) => {
    console.error('Failed to start arena server:', err);
    process.exit(1);
  });

const shutdown = (signal: string) => {
  console.log(`\n${signal} received — shutting down gracefully...`);
  gameServer
    .gracefullyShutdown()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
};

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
