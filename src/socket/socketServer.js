import 'dotenv/config';
import http from 'http';
import express from 'express';
import { initSocket } from './initSocket.js';

async function start() {
  const app = express();
  const server = http.createServer(app);

  initSocket(server);

  const socketPort = Number(process.env.SOCKET_PORT || 5001);
  server.listen(socketPort, () => {
    console.log(`Socket server listening on port ${socketPort}`);
  });
}

start().catch((err) => {
  console.error('Socket server failed to start:', err);
  process.exit(1);
});
