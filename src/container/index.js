import { createContainer, asClass, asValue, Lifetime } from "awilix";
import { config } from "../config/index.js";
import { eventBus } from "../config/notification.js";

import RedisClient from "../core/RedisClient.js";
import MailProvider from "../core/MailProvider.js";
import CloudinaryProvider from "../core/CloudinaryProvider.js";
import JobQueue from "../core/JobQueue.js";
import TransactionManager from "../core/TransactionManager.js";
import SepayProvider from "../core/payment/sepay-provider.js";
import MockIdentityProvider from "../core/verification/MockIdentityProvider.js";

import TransactionSSEService from "../modules/transaction/services/transaction-sse.service.js";
import DisbursementSSEService from "../modules/disbursement/services/disbursement-sse.service.js";
import ReviewWorkflowReconciler from "../modules/volunteer-engagement/review-workflow.reconciler.js";
import ProjectStatusChangeStreamService from "../modules/project/project-status.change-stream.service.js";

import { registerTransactionListeners } from "../modules/transaction/transaction.listener.js";
import { registerDisbursementListeners } from "../modules/disbursement/disbursement.listener.js";

import WinstonLogger from "../core/winston-logger.js";
import AppLogger from "../core/app-logger.js";
import AiProviderFactory from "../modules/ai/ai-provider.factory.js";
import GroqAiProvider from "../modules/ai/providers/groq-ai.provider.js";
import GoogleAiProvider from "../modules/ai/providers/google-ai.provider.js";
import ProjectAIReviewProcessor from "../modules/projectAIReview/project-ai-review.processor.js";
import ProjectAIReviewRepository from "../modules/projectAIReview/project-ai-review.repository.js";
import ProjectAIReviewService from "../modules/projectAIReview/project-ai-review.service.js";

let container;

export const initializeContainer = () => {
  container = createContainer();

  container.register({
    config: asValue(config),
    eventBus: asValue(eventBus),
    winstonLogger: asClass(WinstonLogger).singleton(),
    appLogger: asClass(AppLogger).scoped(),
    redis: asClass(RedisClient).singleton(),
    mailProvider: asClass(MailProvider).singleton(),
    cloudinaryProvider: asClass(CloudinaryProvider).singleton(),
    jobQueue: asClass(JobQueue).singleton(),
    transactionManager: asClass(TransactionManager).singleton(),
    paymentProvider: asClass(SepayProvider).singleton(),
    transactionSseService: asClass(TransactionSSEService).singleton(),
    disbursementSseService: asClass(DisbursementSSEService).singleton(),
    reviewWorkflowReconciler: asClass(ReviewWorkflowReconciler).singleton(),
    projectStatusChangeStreamService: asClass(
      ProjectStatusChangeStreamService
    ).singleton(),

    googleAiProvider: asClass(GoogleAiProvider).scoped(),
    groqAiProvider: asClass(GroqAiProvider).scoped(),
    aiProviderFactory: asClass(AiProviderFactory).scoped(),
    projectAIReviewRepository: asClass(ProjectAIReviewRepository).scoped(),
    projectAIReviewService: asClass(ProjectAIReviewService).scoped(),
    projectAIReviewProcessor: asClass(ProjectAIReviewProcessor).scoped(),
    identityVerificationProvider: asClass(MockIdentityProvider).singleton(),
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
      "../modules/**/*.processor.js",
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

export const startWorkers = async () => {
  const container = getContainer();
  const jobQueue = container.resolve("jobQueue");

  const followProcessor = container.resolve("followProcessor");
  const volunteerReviewProcessor = container.resolve("volunteerReviewProcessor");
  const reviewWorkflowReconciler = container.resolve("reviewWorkflowReconciler");
  const projectStatusChangeStreamService = container.resolve(
    "projectStatusChangeStreamService"
  );

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

  reviewWorkflowReconciler.start();
  await projectStatusChangeStreamService.start();

  console.log(
    "[Worker] All queue workers, event listeners, reconciler, and project change stream have been started."
  );
};

export default {
  initializeContainer,
  registerModule,
  getContainer,
  startWorkers,
};
