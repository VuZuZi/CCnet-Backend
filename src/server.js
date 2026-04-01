// src/server.js
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { config } from './config/index.js';
import { connectDatabase } from './config/database.js';
import routes from '../src/config/routes.js';

const app = express();

// Middleware
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const allowed = config.cors.origin.some(o => o === origin || origin.includes('vercel.app'));
    if (allowed) {
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

// Routes
app.use('/api/v1', routes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('CreatePostPage Error:', err.message);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
  });
});

// Khởi động server
const startServer = async () => {
  await connectDatabase();

  const server = app.listen(config.port, () => {
    console.log(` Server running on port ${config.port}`);
    console.log(` Environment: ${config.env}`);
  });

  server.on('error', (error) => {
    console.error('CreatePostPage Server error:', error);
    process.exit(1);
  });
};

startServer();

export default app;