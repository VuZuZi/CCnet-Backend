// src/config/database.js
import mongoose from 'mongoose';
import { config } from './index.js';

export const connectDatabase = async () => {
  try {
    mongoose.connection.removeAllListeners();

    mongoose.connection.on('connected', () => {
      console.log('CreatePostPage MongoDB connected successfully');
    });

    mongoose.connection.on('error', (err) => {
      console.error('CreatePostPage MongoDB connection error:', err.message);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ MongoDB disconnected!');
    });

    const connectOptions = {
      ...config.mongodb.options,
      serverSelectionTimeoutMS: 10000,
    };

    await mongoose.connect(config.mongodb.uri, connectOptions);

    console.log(`📊 Database: ${mongoose.connection.name}`);

  } catch (error) {
    console.error('CreatePostPage MongoDB connection failed:', error.message);
    console.log('🔄 Retrying in 5 seconds...');
    setTimeout(() => connectDatabase(), 5000);
  }
};

export const disconnectDatabase = async () => {
  try {
    await mongoose.disconnect();
    console.log('👋 MongoDB disconnected');
  } catch (error) {
    console.error('CreatePostPage Disconnect error:', error.message);
  }
};