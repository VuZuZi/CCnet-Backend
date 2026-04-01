// src/server.js
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { config } from './config/index.js';
import { connectDatabase } from './config/database.js';
import configureRoutes from './config/routes.js';  // CreatePostPage Import configureRoutes

const app = express();

// Middleware
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const allowedOrigins = config.cors.origin;
    const isAllowed = allowedOrigins.some(o => o === origin || origin.includes('vercel.app'));
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed'));
    }
  },
  credentials: config.cors.credentials,
  methods: config.cors.methods,
  allowedHeaders: config.cors.allowedHeaders,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan('dev'));

// CreatePostPage Sử dụng configureRoutes
configureRoutes(app);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
  });
});

// Khởi động server
const startServer = async () => {
  await connectDatabase();

  const server = app.listen(config.port, () => {
    console.log(`\n╔══════════════════════════════════════════════════════════╗`);
    console.log(`║  🚀 CCNet Server Started                                 ║`);
    console.log(`╠══════════════════════════════════════════════════════════╣`);
    console.log(`║  Port: ${config.port.toString().padEnd(44)}║`);
    console.log(`║  Environment: ${config.env.padEnd(42)}║`);
    console.log(`║  API: http://localhost:${config.port}/api/v1${' '.padEnd(24)}║`);
    console.log(`╚══════════════════════════════════════════════════════════╝\n`);
  });

  server.on('error', (error) => {
    console.error('❌ Server error:', error);
    process.exit(1);
  });
};

startServer();

export default app;