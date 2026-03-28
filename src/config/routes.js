import authRoutes from "../modules/auth/auth.routes.js";
import postRoutes from "../modules/communitypost/post.routes.js";
import adminRoutes from "../modules/admin/admin.routes.js";
import userRoutes from "../modules/user/user.routes.js";
import mediaRoutes from "../modules/media/media.routes.js";
import searchRoutes from "../modules/search/search.routes.js";
import chatRoutes from "../modules/chat/chat.routes.js";
import followRoutes from "../modules/follow/follow.routes.js";
import projectRoutes from "../modules/project/project.routes.js"
import volunteerRoutes from "../modules/volunteer/volunteer.routes.js"
import helpRequestRoutes from "../modules/helprequest/helprequest.routes.js";
import projectRoutes from "../modules/project/project.routes.js";
import {
  organizerRequestUserRouter,
  organizerRequestAdminRouter,
} from "../modules/organizerRequest/organizerRequest.routes.js";

export const configureRoutes = (app) => {
  const API_PREFIX = "/api/v1";

  app.use(`${API_PREFIX}/auth`, authRoutes);
  app.use(`${API_PREFIX}/posts`, postRoutes);
  app.use(`${API_PREFIX}/admin`, adminRoutes);
  app.use(`${API_PREFIX}/user`, userRoutes);
  app.use(`${API_PREFIX}/media`, mediaRoutes);
  app.use(`${API_PREFIX}/search`, searchRoutes);
  app.use(`${API_PREFIX}/chat`, chatRoutes);
  app.use(`${API_PREFIX}/follow`, followRoutes);
  app.use(`${API_PREFIX}/project`, projectRoutes);
  app.use(`${API_PREFIX}/volunteer`, volunteerRoutes);
  app.use(`${API_PREFIX}/help-requests`, helpRequestRoutes);
  app.use(`${API_PREFIX}/organizer-requests`, organizerRequestUserRouter);
  app.use(`${API_PREFIX}/admin/organizer-requests`, organizerRequestAdminRouter);

  app.use((req, res) => {
    res.status(404).json({
      status: "error",
      message: `Route ${req.method} ${req.path} not found`,
      availableRoutes: [
        `${API_PREFIX}/auth/*`,
        `${API_PREFIX}/posts/*`,
        `${API_PREFIX}/admin/*`,
        `${API_PREFIX}/admin/organizer-requests/*`,
        `${API_PREFIX}/user/*`,
        `${API_PREFIX}/media/*`,
        `${API_PREFIX}/search/*`,
        `${API_PREFIX}/chat/*`,
        `${API_PREFIX}/follow/*`,
        `${API_PREFIX}/project/*`,
        `${API_PREFIX}/volunteer/*`,
        `${API_PREFIX}/help-requests/*`,
        `${API_PREFIX}/organizer-requests/*`,
        "/health",
        "/api",
      ],
    });
  });
};

export const configureErrorHandling = (app, errorHandler) => {
  app.use(errorHandler);
};