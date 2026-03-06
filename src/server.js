import { config } from './config/index.js';
import { connectDatabase } from './config/database.js';
import { getContainer } from './container/index.js';
import createApp from './app.js';

let server;
const initializeConnections = async () => {
  try {
    console.log(' Connecting to external services...');
    await connectDatabase();
    const container = getContainer();
    const redis = container.resolve('redis');
    await redis.set('health:check', '1', 'EX', 10);
    
    console.log(' All external connections established');
  } catch (error) {
    console.error(' Failed to initialize connections:', error);
    throw error;
  }
};

const startServer = async () => {
  try {
    const app = await createApp();
    
    await initializeConnections();
    server = app.listen(config.port, () => {
      console.log('Server is running!');
      console.log(`Environment: ${config.env}`);
      console.log(`Port: ${config.port}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

const gracefulShutdown = async (signal) => {
  console.log(`\n  ${signal} received. Starting graceful shutdown...`);
  
  if (server) {
    server.close(async () => {
      console.log(' HTTP server closed');
      
      try {
        const container = getContainer();

        const jobQueue = container.resolve('jobQueue');
        if (jobQueue && jobQueue.close) {
            console.log('Closing Job Queues & Workers...');
            await jobQueue.close(); 
        }

        const redis = container.resolve('redis');
        await redis.getClient().quit();
        console.log('Redis connection closed');
        
        const mongoose = await import('mongoose');
        await mongoose.default.connection.close();
        console.log('MongoDB connection closed');
        
        console.log(' Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        console.error(' Error during shutdown:', error);
        process.exit(1);
      }
    });
    
    setTimeout(() => {
      console.error('  Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  console.error(' Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

startServer();