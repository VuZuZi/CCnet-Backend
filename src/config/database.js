import mongoose from 'mongoose';
import { config } from './index.js';

export const connectDatabase = async () => {
  try {
    mongoose.connection.on('connected', () => {
      console.log(' MongoDB connected successfully');
    });

    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB disconnected! Attempting to reconnect...');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('MongoDB reconnected!');
    });

    await mongoose.connect(config.mongodb.uri, config.mongodb.options);
    
  } catch (error) {
    console.error('Fatal: Could not connect to MongoDB:', error);
    process.exit(1);
  }
};