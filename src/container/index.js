import { createContainer, asClass, asValue, Lifetime } from "awilix";
import { config } from "../config/index.js";
import { eventBus } from "../config/notification.js";

import RedisClient from "../core/RedisClient.js";
import MailProvider from "../core/MailProvider.js";
import CloudinaryProvider from "../core/CloudinaryProvider.js";
import JobQueue from "../core/JobQueue.js";
import TransactionManager from "../core/TransactionManager.js";
import SepayProvider from "../core/payment/sepay-provider.js";

import TransactionSSEService from "../modules/transaction/services/transaction-sse.service.js";
import DisbursementSSEService from "../modules/disbursement/services/disbursement-sse.service.js";

import { registerTransactionListeners } from "../modules/transaction/transaction.listener.js";
import { registerDisbursementListeners } from "../modules/disbursement/disbursement.listener.js";

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
    paymentProvider: asClass(SepayProvider).singleton(),
    transactionSseService: asClass(TransactionSSEService).singleton(),
    disbursementSseService: asClass(DisbursementSSEService).singleton(),
  });

  container.loadModules(
    [
      "!../modules/transaction/services/transaction-sse.service.js",
      "!../modules/disbursement/services/disbursement-sse.service.js",
      "!../modules/notification/services/notification.service.js",
      "!../modules/notification/services/notificationSSE.service.js",
      "!../modules/notification/services/notificationBroadcast.service.js",
      "!../modules/notification/services/notificationSetting.service.js",
      "!../modules/notification/repositories/notification.repository.js",
      "!../modules/notification/repositories/notificationSetting.repository.js",
      "!../modules/notification/notification.controller.js",

      "../modules/**/*.service.js",
      "../modules/**/*.repository.js",
      "../modules/**/*.controller.js",
      "../modules/**/*.processor.js"
    ],
    {
      cwd: import.meta.dirname,
      formatName: "camelCase",
      resolverOptions: {
        lifetime: Lifetime.SCOPED,
        register: asClass,
      },
    }
  );

  console.log("DI Container initialized with Auto-loading");
};

export const registerModule = async (moduleName) => {
  console.log(`Module ${moduleName} loaded automatically via Awilix`);
};

export const getContainer = () => {
  if (!container) throw new Error("DI Container not initialized.");
  return container;
};

export const startWorkers = () => {
  const container = getContainer();
  const jobQueue = container.resolve("jobQueue");

  const followProcessor = container.resolve("followProcessor");
  const volunteerReviewProcessor = container.resolve("volunteerReviewProcessor");

  jobQueue.registerWorker("follow-updates", followProcessor.getProcessor());
  jobQueue.registerWorker(
    "volunteer-review",
    volunteerReviewProcessor.getProcessor()
  );

  const eventBus = container.resolve("eventBus");
  const transactionService = container.resolve("transactionService");
  const disbursementService = container.resolve("disbursementService");

  registerTransactionListeners({ eventBus, transactionService });
  registerDisbursementListeners({ eventBus, disbursementService });

  console.log("[Worker] All queue workers and event listeners have been started.");
};

export default {
  initializeContainer,
  registerModule,
  getContainer,
  startWorkers,
};