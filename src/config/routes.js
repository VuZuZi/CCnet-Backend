import authRoutes from '../modules/auth/auth.routes.js';
import chatRoutes from '../modules/chat/chat.routes.js';
import searchRoutes from '../modules/search/search.routes.js';
import followRoutes from '../modules/follow/follow.routes.js';

export const configureRoutes = (app) => {
  const API_PREFIX = '/api/v1';

  app.use(`${API_PREFIX}/auth`, authRoutes);
  app.use(`${API_PREFIX}/chat`, chatRoutes);
  app.use(`${API_PREFIX}/search`, searchRoutes);
  app.use(`${API_PREFIX}/follow`, followRoutes);

  app.use((req, res) => {
    res.status(404).json({
      status: 'error',
      message: `Route ${req.method} ${req.path} not found`,
      availableRoutes: [
        `${API_PREFIX}/auth/*`,
        `${API_PREFIX}/chat/*`,
        `${API_PREFIX}/search`,
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
