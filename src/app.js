import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";

import { config } from "./config/index.js";
import {
  configureMiddleware,
  configureSystemRoutes,
} from "./config/express.js";
import { configureRoutes } from "./config/routes.js";
import { initializeContainer, registerModule } from "./container/index.js";

import { initPostWorkers } from "./modules/communitypost/post.worker.js";
import { initFollowWorkers } from "./modules/follow/follow.worker.js";
import { initProjectWorkers } from "./modules/project/project.worker.js";
import { initVolunteerWorkers } from "./modules/volunteer/volunteer.worker.js";

export const createApp = async () => {
  const app = express();

  initializeContainer();

  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        const allowedOrigins = config.cors?.origin || [];
        const isAllowed = allowedOrigins.some(
          (o) => o === origin || origin.includes("vercel.app"),
        );
        if (isAllowed) {
          callback(null, true);
        } else {
          callback(new Error("CORS not allowed"));
        }
      },
      credentials: config.cors?.credentials,
      methods: config.cors?.methods,
      allowedHeaders: config.cors?.allowedHeaders,
    }),
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(morgan("dev"));

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

  if (typeof configureSystemRoutes === "function") {
    configureSystemRoutes(app);
  }

  configureRoutes(app);

  app.use((err, req, res, next) => {
    console.error(`[Global Error] ${err.name}:`, err.message);

    const statusCode = err.statusCode || 500;

    const status = err.status || "error";
    let message = err.message;
    if (!err.isOperational && statusCode === 500) {
      message = "Internal server error";
    }

    const errorResponse = {
      status,
      message,
    };

    if (err.errors) {
      errorResponse.errors = err.errors;
    }

    res.status(statusCode).json(errorResponse);
  });

  return app;
};

export default createApp;
