import { createContainer, asClass, asValue, Lifetime } from "awilix";
import { config } from "../config/index.js";
import { eventBus } from "../config/notification.js";

import RedisClient from "../core/RedisClient.js";
import MailProvider from "../core/MailProvider.js";
import CloudinaryProvider from "../core/CloudinaryProvider.js";
import JobQueue from "../core/JobQueue.js";
import TransactionManager from "../core/TransactionManager.js";
import PayosProvider from "../core/payment/PayosProvider.js";
import { registerTransactionListeners } from "../modules/transaction/transaction.listener.js";

let container;

export const initializeContainer = () => {
  container = createContainer();

  container.register({
    config: asValue(config),
    eventBus: asValue(eventBus),
    redis: asClass(RedisClient).singleton(),
    mailProvider: asClass(MailProvider).singleton(),
    cloudinaryProvider: asClass(CloudinaryProvider).singleton(),
    jobQueue: asClass(JobQueue).singleton(),
    transactionManager: asClass(TransactionManager).singleton(),
    paymentProvider: asClass(PayosProvider).singleton(),
  });

  container.loadModules(
    [
      "../modules/**/*.service.js",
      "../modules/**/*.repository.js",
      "../modules/**/*.controller.js",
      "../modules/**/*.processor.js",

      "!../modules/notification/services/notification.service.js",
      "!../modules/notification/services/notificationSSE.service.js",
      "!../modules/notification/services/notificationBroadcast.service.js",
      "!../modules/notification/services/notificationSetting.service.js",
      "!../modules/notification/repositories/notification.repository.js",
      "!../modules/notification/repositories/notificationSetting.repository.js",
      "!../modules/notification/notification.controller.js",
    ],
    {
      cwd: import.meta.dirname,
      formatName: "camelCase",
      resolverOptions: {
        lifetime: Lifetime.SCOPED,
        register: asClass,
      },
    },
  );

  console.log("DI Container initialized with Auto-loading");
};

export const registerModule = async (moduleName) => {
  console.log(`Module ${moduleName} loaded automatically via Awilix`);
};

export const getContainer = () => {
  if (!container) {
    throw new Error("DI Container not initialized. Call initializeContainer() first.");
  }

  return container;
};

export const startWorkers = () => {
  const container = getContainer();
  const jobQueue = container.resolve("jobQueue");
  const followProcessor = container.resolve("followProcessor");

  jobQueue.registerWorker("follow-updates", followProcessor.getProcessor());

  const eventBus = container.resolve("eventBus");
  const transactionService = container.resolve("transactionService");

  registerTransactionListeners({ eventBus, transactionService });

  console.log("[Worker] All queue workers and event listeners have been started.");
};

export default {
  initializeContainer,
  registerModule,
  getContainer,
  startWorkers,
};