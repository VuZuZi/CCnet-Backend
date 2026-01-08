import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import { configureMiddleware, configureSystemRoutes } from './config/express.js';
import { configureRoutes, configureErrorHandling } from './config/routes.js';
import errorHandler from './middlewares/errorHandler.js';
import { initializeContainer, registerModule } from './container/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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


  const rootDir = path.resolve(__dirname, '..');
  const uploadsPath = path.join(rootDir, 'uploads');
  console.log('Serving uploads from:', uploadsPath); 
  app.use('/uploads', express.static(uploadsPath)); 

  configureErrorHandling(app, errorHandler);

  console.log('Express application configured successfully');
  return app;
};

export default createApp;