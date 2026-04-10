import "dotenv/config";
import { config } from "./config/index.js";
import { connectDatabase } from "./config/database.js";
import { createApp } from "./app.js";

const listenWithRetry = async (app, startPort, maxAttempts = 10) => {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const port = startPort + attempt;
    try {
      const server = await new Promise((resolve, reject) => {
        const s = app.listen(port, () => {
          s.off("error", reject);
          resolve(s);
        });
        s.once("error", reject);
      });
      return { server, port };
    } catch (error) {
      if (error?.code === "EADDRINUSE") continue;
      throw error;
    }
  }
  throw new Error("No available port for API server");
};

const startServer = async () => {
  try {
    await connectDatabase();

    const app = await createApp();

    const startPort = Number(process.env.PORT || config.port || 5000);
    const { server, port } = await listenWithRetry(app, startPort, 10);

    console.log(
      `\n╔══════════════════════════════════════════════════════════╗`,
    );
    console.log(
      `║  🚀 CCNet Server Started                                 ║`,
    );
    console.log(
      `╠══════════════════════════════════════════════════════════╣`,
    );
    console.log(`║  Port: ${String(port).padEnd(44)}║`);
    console.log(`║  Environment: ${String(config.env || "").padEnd(42)}║`);
    console.log(
      `║  API: http://localhost:${port}/api/v1${" ".padEnd(24)}║`,
    );
    console.log(
      `╚══════════════════════════════════════════════════════════╝\n`,
    );

    server.on("error", (error) => {
      console.error("Server error:", error);
      process.exit(1);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
