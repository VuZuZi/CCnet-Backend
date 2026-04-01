import { config } from "./config/index.js";
import { connectDatabase } from "./config/database.js";
import { createApp } from "./app.js";

const startServer = async () => {
  try {
    await connectDatabase();

    const app = await createApp();

    const server = app.listen(config.port, () => {
      console.log(
        `\n╔══════════════════════════════════════════════════════════╗`,
      );
      console.log(
        `║  🚀 CCNet Server Started                                 ║`,
      );
      console.log(
        `╠══════════════════════════════════════════════════════════╣`,
      );
      console.log(`║  Port: ${config.port.toString().padEnd(44)}║`);
      console.log(`║  Environment: ${config.env.padEnd(42)}║`);
      console.log(
        `║  API: http://localhost:${config.port}/api/v1${" ".padEnd(24)}║`,
      );
      console.log(
        `╚══════════════════════════════════════════════════════════╝\n`,
      );
    });

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
