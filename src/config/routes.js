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

// CreatePostPage Kiểm tra từng route trước khi dùng
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

// CreatePostPage Debug: Kiểm tra từng route
ROUTES.forEach(({ path, handler }) => {
  console.log(`🔍 Checking route ${path}:`, typeof handler);
  if (typeof handler !== 'function') {
    console.error(`❌ Route ${path} is not a function! It is:`, handler);
  }
});

export const configureRoutes = (app) => {
  // CreatePostPage Chỉ đăng ký các route hợp lệ
  ROUTES.forEach(({ path, handler }) => {
    if (typeof handler === 'function') {
      app.use(`${API_PREFIX}${path}`, handler);
      console.log(`CreatePostPage Route registered: ${API_PREFIX}${path}`);
    } else {
      console.error(`❌ Skipping route ${path}: handler is not a function`);
    }
  });

<<<<<<< feature/Dungshare
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
  app.use(
    `${API_PREFIX}/admin/organizer-requests`,
    organizerRequestAdminRouter,
  );
=======
  // Health check
  app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });
>>>>>>> dev

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      message: `Route ${req.method} ${req.path} not found`,
    });
  });
};

<<<<<<< feature/Dungshare
export default configureRoutes;
=======
// CreatePostPage Export configureRoutes (không export routes trực tiếp)
export default configureRoutes;
>>>>>>> dev
