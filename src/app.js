import express from "express";

import {
  configureMiddleware,
  configureSystemRoutes,
} from "./config/express.js";
import { configureRoutes } from "./config/routes.js";
import { getContainer, initializeContainer, registerModule } from "./container/index.js";
import { createConfiguredNotificationModule } from "./config/notification.js";

import { initPostWorkers } from "./modules/communitypost/post.worker.js";
import { initFollowWorkers } from "./modules/follow/follow.worker.js";
import { initProjectWorkers } from "./modules/project/project.worker.js";
import { initVolunteerWorkers } from "./modules/volunteer/volunteer.worker.js";
import { initUserWorkers } from  "./modules/user/user.worker.js";

export const createApp = async () => {
  const app = express();

  initializeContainer();
  getContainer().resolve("paymentProvider");

  const notificationModule = await createConfiguredNotificationModule();

  if (typeof configureMiddleware === "function") {
    configureMiddleware(app);
  }

  await registerModule("auth");
  await registerModule("user");
  await registerModule("communitypost");
  await registerModule("chat");
  await registerModule("follow");
  await registerModule("search");
  await registerModule("project");
  await registerModule("volunteer");

  initPostWorkers();
  initFollowWorkers();
  initProjectWorkers();
  initVolunteerWorkers();
  initUserWorkers();

  if (typeof configureSystemRoutes === "function") {
    configureSystemRoutes(app);
  }

  configureRoutes(app, { notificationModule });

  app.use((err, req, res, next) => {
    console.error(`[Global Error] ${err?.name || "Error"}:`, err?.message);

    const statusCode =
      Number.isInteger(err?.statusCode)
        ? err.statusCode
        : Number.isInteger(err?.status)
          ? err.status
          : 500;

    const status = typeof err?.status === "string" ? err.status : "error";

    let message = err?.message || "Internal server error";
    if (!err?.isOperational && statusCode === 500) {
      message = "Internal server error";
    }

    const errorResponse = {
      success: false,
      status,
      message,
    };

    if (err?.errors) {
      errorResponse.errors = err.errors;
    }

    res.status(statusCode).json(errorResponse);
  });

  return app;
};

export default createApp;