import { createContainer, asClass, asValue, Lifetime } from 'awilix';
import { config } from '../config/index.js';

import RedisClient from '../core/RedisClient.js';
import MailProvider from '../core/MailProvider.js';
import CloudinaryProvider from '../core/CloudinaryProvider.js';
import JobQueue from '../core/JobQueue.js';

let container;

export const initializeContainer = () => {
  container = createContainer();

  container.register({
    config: asValue(config),
    redis: asClass(RedisClient).singleton(),
    mailProvider: asClass(MailProvider).singleton(),
    cloudinaryProvider: asClass(CloudinaryProvider).singleton(),
    jobQueue: asClass(JobQueue).singleton(),
  });

  container.loadModules(
    [
      '../modules/**/*.service.js',
      '../modules/**/*.repository.js',
      '../modules/**/*.controller.js',
      '../modules/**/*.processor.js'
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

export const startWorkers = () => {
  const container = getContainer();
  const jobQueue = container.resolve('jobQueue');
  const followProcessor = container.resolve('followProcessor');
  jobQueue.registerWorker('follow-updates', followProcessor.getProcessor());
  
  console.log('[Worker] All queue workers have been started.');
};