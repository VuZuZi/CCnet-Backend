import authRoutes from '../modules/auth/auth.routes.js';
import postRoutes from '../modules/communitypost/post.routes.js';

export const configureRoutes = (app) => {
  const API_PREFIX = '/api/v1';

  app.use(`${API_PREFIX}/auth`, authRoutes);
  app.use(`${API_PREFIX}/posts`, postRoutes);

  app.use((req, res) => {
    res.status(404).json({
      status: 'error',
      message: `Route ${req.method} ${req.path} not found`
    });
  });
};

export const configureErrorHandling = (app, errorHandler) => {
  app.use(errorHandler);
};
