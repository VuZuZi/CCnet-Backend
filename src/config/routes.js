import authRoutes from "../modules/auth/auth.routes.js";
import postRoutes from "../modules/communitypost/post.routes.js";
import adminRoutes from "../modules/admin/admin.routes.js";

import userRoutes from '../modules/user/user.routes.js';
import mediaRoutes from '../modules/media/media.routes.js';
export const configureRoutes = (app) => {
  const API_PREFIX = "/api/v1";

  app.use(`${API_PREFIX}/auth`, authRoutes);
  app.use(`${API_PREFIX}/posts`, postRoutes);
  app.use(`${API_PREFIX}/admin`, adminRoutes);


  app.use((req, res) => {
    res.status(404).json({
      status: 'error',
      message: `Route ${req.method} ${req.path} not found`,
      availableRoutes: [
        `${API_PREFIX}/auth/*`,
        `${API_PREFIX}/user/*`,
        '/health',
        '/api'
      ]
    });
  });
};

export const configureErrorHandling = (app, errorHandler) => {
  app.use(errorHandler);
};
