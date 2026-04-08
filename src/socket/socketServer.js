import 'dotenv/config';
import http from 'http';
import express from 'express';
import { initSocket } from './initSocket.js';

async function listenWithRetry(server, startPort, maxAttempts = 10) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const port = startPort + attempt;
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, () => {
          server.off('error', reject);
          resolve();
        });
      });
      return port;
    } catch (err) {
      if (err?.code === 'EADDRINUSE') continue;
      throw err;
    }
  }
  throw new Error('No available port for Socket server');
}

async function start() {
  const app = express();
  const server = http.createServer(app);

  initSocket(server);

  const socketPort = Number(process.env.SOCKET_PORT || 5001);
  const port = await listenWithRetry(server, socketPort, 10);
  console.log(`Socket server listening on port ${port}`);
}

start().catch((err) => {
  console.error('Socket server failed to start:', err);
  process.exit(1);
});
