import express from 'express';
import { configureMiddleware, configureSystemRoutes } from './config/express.js';
import { configureRoutes, configureErrorHandling } from './config/routes.js';
import errorHandler from './middlewares/errorHandler.js';
import { initializeContainer, registerModule } from './container/index.js';

export const createApp = async () => {
  const app = express();

  console.log('Initializing DI Container...');
  initializeContainer();

  console.log('Configuring middleware...');
  configureMiddleware(app); 

  console.log('Registering modules...');
  await registerModule('auth'); 

  configureSystemRoutes(app);
  
  console.log('Configuring routes...');
  configureRoutes(app);

  configureErrorHandling(app, errorHandler);

  console.log('Express application configured successfully');
  return app;
};

export default createApp;