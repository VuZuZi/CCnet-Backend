import { createContainer, asClass, asValue, Lifetime } from 'awilix';
import { config } from '../config/index.js';

import RedisClient from '../core/RedisClient.js';
import MailProvider from '../core/MailProvider.js';

let container;

export const initializeContainer = () => {
  container = createContainer();

  container.register({
    config: asValue(config),
    redis: asClass(RedisClient).singleton(),
    mailProvider: asClass(MailProvider).singleton(),
  });

  container.loadModules(
    [
      '../modules/**/*.service.js',
      '../modules/**/*.repository.js',
      '../modules/**/*.controller.js'
    ],
    {
      cwd: import.meta.dirname, 
      
      formatName: 'camelCase', 
      resolverOptions: {
        lifetime: Lifetime.SCOPED,
        register: asClass
      }
    }
  );
  
  console.log('DI Container initialized with Auto-loading');
};

export const registerModule = async (moduleName) => {
    console.log(`Module ${moduleName} loaded automatically via Awilix`);
};

export const getContainer = () => {
  if (!container) {
    throw new Error('DI Container not initialized. Call initializeContainer() first.');
  }
  return container;
};