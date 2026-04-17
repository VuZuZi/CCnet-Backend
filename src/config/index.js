import dotenv from 'dotenv';
import Joi from 'joi';

dotenv.config();

const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(5000),

  MONGODB_URI: Joi.string().required().description('Mongo DB URL'),

  JWT_ACCESS_SECRET: Joi.string().required(),
  JWT_REFRESH_SECRET: Joi.string().required(),
  JWT_ACCESS_EXPIRE: Joi.string().default('5m'),
  JWT_REFRESH_EXPIRE_DAYS: Joi.number().default(7),

  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),

  CLOUDINARY_CLOUD_NAME: Joi.string().optional(),
  CLOUDINARY_API_KEY: Joi.string().optional(),
  CLOUDINARY_API_SECRET: Joi.string().optional(),

  GOOGLE_CLIENT_ID: Joi.string().required(),

  EMAIL_HOST: Joi.string().default('smtp.gmail.com'),
  EMAIL_PORT: Joi.number().default(587),
  EMAIL_USER: Joi.string().required(),
  EMAIL_PASSWORD: Joi.string().required(),
  EMAIL_FROM: Joi.string().optional(),

  CORS_ORIGIN: Joi.string().optional(),
  REDIS_URL: Joi.string().allow('', null).optional(),
  EMAIL_SECURE: Joi.string().valid('true', 'false').optional(),
  FRONTEND_URL: Joi.string().uri().optional(),

  NOTIFICATION_STREAM_CROSS_SITE: Joi.string().valid('true', 'false').default('false'),

  PLATFORM_FEE_PERCENT: Joi.number().min(0).max(1).default(0.015),
  
  SEPAY_BANK_NAME: Joi.string().required(),
  SEPAY_ACCOUNT_NUMBER: Joi.string().required(),
  SEPAY_WEBHOOK_SECRET: Joi.string().required(),
  SEPAY_API_TOKEN: Joi.string().required(),

  PAYOS_CLIENT_ID: Joi.string().optional(),
  PAYOS_API_KEY: Joi.string().optional(),
  PAYOS_CHECKSUM_KEY: Joi.string().optional(),

}).unknown();

const { error, value: envVars } = envSchema.validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

const parseCorsOrigins = () => {
  const corsOrigin = envVars.CORS_ORIGIN || 'http://localhost:3000';
  if (corsOrigin.includes(',')) {
    return corsOrigin.split(',').map((origin) => origin.trim());
  }
  return [corsOrigin];
};

export const config = {
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  frontendUrl: envVars.FRONTEND_URL || 'http://localhost:5173',

  mongodb: {
    uri: envVars.MONGODB_URI,
    options: {
      maxPoolSize: 200,
      minPoolSize: 20,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4,
    },
  },

  redis: {
    url: envVars.REDIS_URL || null,
    host: envVars.REDIS_HOST,
    port: envVars.REDIS_PORT,
    password: envVars.REDIS_PASSWORD || '',
  },

  jwt: {
    accessSecret: envVars.JWT_ACCESS_SECRET,
    refreshSecret: envVars.JWT_REFRESH_SECRET,
    accessExpire: envVars.JWT_ACCESS_EXPIRE,
    refreshExpireSeconds: envVars.JWT_REFRESH_EXPIRE_DAYS * 24 * 60 * 60,
  },

  cloudinary: {
    cloudName: envVars.CLOUDINARY_CLOUD_NAME || '',
    apiKey: envVars.CLOUDINARY_API_KEY || '',
    apiSecret: envVars.CLOUDINARY_API_SECRET || '',
  },

  google: {
    clientId: envVars.GOOGLE_CLIENT_ID,
  },

  email: {
    host: envVars.EMAIL_HOST,
    port: envVars.EMAIL_PORT,
    user: envVars.EMAIL_USER,
    password: envVars.EMAIL_PASSWORD,
    from: envVars.EMAIL_FROM || envVars.EMAIL_USER,
    secure: envVars.EMAIL_SECURE === 'true',
  },

  cors: {
    origin: parseCorsOrigins(),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  },

  notification: {
    streamCrossSite: envVars.NOTIFICATION_STREAM_CROSS_SITE === 'true',
  },

  payos: {
    clientId: envVars.PAYOS_CLIENT_ID,
    apiKey: envVars.PAYOS_API_KEY,
    checksumKey: envVars.PAYOS_CHECKSUM_KEY,
  },

  sepay: {
    bankName: envVars.SEPAY_BANK_NAME,
    accountNumber: envVars.SEPAY_ACCOUNT_NUMBER,
    webhookSecret: envVars.SEPAY_WEBHOOK_SECRET,
    apiToken: envVars.SEPAY_API_TOKEN
  },
  
  platformFeePercent: envVars.PLATFORM_FEE_PERCENT,
};