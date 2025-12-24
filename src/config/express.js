import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan'; 
import { config } from './index.js';

export const configureMiddleware = (app) => {
  app.use(helmet({
    contentSecurityPolicy: config.env === 'production',
    crossOriginEmbedderPolicy: config.env === 'production',
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" } 
  }));

  app.use(cors({
    origin: config.cors.origin, 
    credentials: true, 
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  }));

  app.use(express.json({ limit: '10mb' })); 
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));


  if (config.env === 'development') {
    app.use(morgan('dev')); 
  } else {
    app.use(morgan('combined')); 
  }
  
  app.set('trust proxy', 1);
};

export const configureSystemRoutes = (app) => {
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'UP',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  });
};