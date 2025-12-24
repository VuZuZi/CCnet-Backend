import authRoutes from '../modules/auth/auth.routes.js';
export const configureRoutes = (app) => {
  const API_PREFIX = '/api/v1';

  app.use(`${API_PREFIX}/auth`, authRoutes);
  app.use((req, res) => {
    res.status(404).json({
      status: 'error',
      message: `Route ${req.method} ${req.path} not found`,
      availableRoutes: [
        `${API_PREFIX}/auth/*`,
        '/health',
        '/api'
      ]
    });
  });
};

export const configureErrorHandling = (app, errorHandler) => {
  app.use(errorHandler);
};