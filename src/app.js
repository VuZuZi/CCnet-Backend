import express from "express";
import {
  configureMiddleware,
  configureSystemRoutes,
} from "./config/express.js";
import { configureRoutes } from "./config/routes.js";
import errorHandler from "./middlewares/errorHandler.js";
import { initializeContainer, registerModule } from "./container/index.js";

import { initPostWorkers } from "./modules/communitypost/post.worker.js";
import { initFollowWorkers } from "./modules/follow/follow.worker.js";
import { initProjectWorkers } from "./modules/project/project.worker.js";
import { initVolunteerWorkers } from "./modules/volunteer/volunteer.worker.js";

export const createApp = async () => {
  const app = express();

  console.log("Initializing DI Container...");
  initializeContainer();

  console.log("Configuring middleware...");
  configureMiddleware(app);

  console.log("Registering modules...");
  await registerModule("auth");
  await registerModule("user");
  await registerModule("communitypost");

  await registerModule("chat");
  await registerModule("follow");
  await registerModule("search");

  await registerModule("project");

  await registerModule("volunteer");

  console.log("Starting Background Workers...");
  initPostWorkers();
  initFollowWorkers();
  initProjectWorkers();
  initVolunteerWorkers(); //vudd6
  configureSystemRoutes(app);

  console.log("Configuring routes...");
  configureRoutes(app);

  console.log("Express application configured successfully");
  return app;
};

export default createApp;
