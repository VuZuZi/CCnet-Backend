// src/config/routes.js
import authRoutes from "../modules/auth/auth.routes.js";
import postRoutes from "../modules/communitypost/post.routes.js";
import adminRoutes from "../modules/admin/admin.routes.js";
import userRoutes from "../modules/user/user.routes.js";
import mediaRoutes from "../modules/media/media.routes.js";
import searchRoutes from "../modules/search/search.routes.js";
import chatRoutes from "../modules/chat/chat.routes.js";
import followRoutes from "../modules/follow/follow.routes.js";
import projectRoutes from "../modules/project/project.routes.js";
import volunteerRoutes from "../modules/volunteer/volunteer.routes.js";
import helpRequestRoutes from "../modules/helpRequest/helpRequest.routes.js";
import {
  organizerRequestUserRouter,
  organizerRequestAdminRouter,
} from "../modules/organizerRequest/organizerRequest.routes.js";

const API_PREFIX = "/api/v1";

// CreatePostPage Danh sách routes để dễ quản lý
const ROUTES = [
  { path: "/auth", handler: authRoutes },
  { path: "/posts", handler: postRoutes },
  { path: "/admin", handler: adminRoutes },
  { path: "/user", handler: userRoutes },
  { path: "/media", handler: mediaRoutes },
  { path: "/search", handler: searchRoutes },
  { path: "/chat", handler: chatRoutes },
  { path: "/follow", handler: followRoutes },
  { path: "/project", handler: projectRoutes },
  { path: "/volunteer", handler: volunteerRoutes },
  { path: "/help-requests", handler: helpRequestRoutes },
  { path: "/organizer-requests", handler: organizerRequestUserRouter },
  { path: "/admin/organizer-requests", handler: organizerRequestAdminRouter },
];

// CreatePostPage Health check route
export const healthCheck = (req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    env: process.env.NODE_ENV,
  });
};

// CreatePostPage API info route
export const apiInfo = (req, res) => {
  res.status(200).json({
    name: "CCNet API",
    version: "1.0.0",
    environment: process.env.NODE_ENV,
    endpoints: ROUTES.map(route => `${API_PREFIX}${route.path}`),
  });
};

// CreatePostPage Cấu hình routes
export const configureRoutes = (app) => {
  // Register all routes
  ROUTES.forEach(({ path, handler }) => {
    app.use(`${API_PREFIX}${path}`, handler);
    console.log(` Route registered: ${API_PREFIX}${path}`);
  });

  // Health check endpoints
  app.get("/health", healthCheck);
  app.get("/api", apiInfo);

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      status: "error",
      message: `Route ${req.method} ${req.path} not found`,
      availableRoutes: [
        "/health",
        "/api",
        ...ROUTES.map(route => `${API_PREFIX}${route.path}/*`),
      ],
    });
  });
};

// CreatePostPage Cấu hình error handling
export const configureErrorHandling = (app, errorHandler) => {
  app.use(errorHandler);
};

export default {
  configureRoutes,
  configureErrorHandling,
  healthCheck,
  apiInfo,
  ROUTES,
  API_PREFIX,
};