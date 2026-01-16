import authRoutes from '../modules/auth/auth.routes.js';
import projectRoutes from '../modules/project/project.routes.js';

export const configureRoutes = (app) => {
  const API_PREFIX = '/api/v1';

  app.use(`${API_PREFIX}/auth`, authRoutes);
  app.use(`${API_PREFIX}/projects`, projectRoutes);

  app.use((req, res) => {
    res.status(404).json({
      status: 'error',
      message: `Route ${req.method} ${req.path} not found`,
      availableRoutes: [
        `${API_PREFIX}/auth/*`,
        `${API_PREFIX}/projects/*`,
        '/health',
        '/api'
      ]
    });
  });
};

export const configureErrorHandling = (app, errorHandler) => {
  app.use(errorHandler);
};