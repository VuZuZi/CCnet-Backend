import authRoutes from "../modules/auth/auth.routes.js";
import postRoutes from "../modules/communitypost/post.routes.js";
import adminRoutes from "../modules/admin/admin.routes.js";
import chatRoutes from '../modules/chat/chat.routes.js';
import searchRoutes from '../modules/search/search.routes.js';
import followRoutes from '../modules/follow/follow.routes.js';

export const configureRoutes = (app) => {
  const API_PREFIX = "/api/v1";

  // TẤT CẢ các route phải được đặt TRƯỚC 404 Handler
  app.use(`${API_PREFIX}/auth`, authRoutes);
  app.use(`${API_PREFIX}/posts`, postRoutes);
  app.use(`${API_PREFIX}/admin`, adminRoutes);
  app.use(`${API_PREFIX}/chat`, chatRoutes);     
  app.use(`${API_PREFIX}/search`, searchRoutes); 
  app.use(`${API_PREFIX}/follow`, followRoutes); 

  // 404 Handler PHẢI ở cuối cùng
  app.use((req, res) => {
    res.status(404).json({
      status: "error",
      message: `Route ${req.method} ${req.path} not found`,
      availableRoutes: [
        `${API_PREFIX}/auth/*`,
        `${API_PREFIX}/posts/*`,
        `${API_PREFIX}/admin/*`,
        `${API_PREFIX}/chat/*`,
        `${API_PREFIX}/search/*`,
        `${API_PREFIX}/follow/*`,
        '/health',
        '/api'
      ]
    });
  });
};

export const configureErrorHandling = (app, errorHandler) => {
  app.use(errorHandler);
};