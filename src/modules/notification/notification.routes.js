import { Router } from 'express';

export function createNotificationRouter({
  controller,
  authenticate,
  streamAuthenticate,
}) {
  const router = Router();

  router.post('/stream/session', authenticate, controller.createStreamSession);
  router.get('/stream/events', streamAuthenticate, controller.stream);

  router.use(authenticate);

  router.get('/', controller.getNotifications);
  router.get('/unread-count', controller.getUnreadCount);
  router.get('/settings', controller.getSettings);
  router.patch('/settings', controller.updateSettings);
  router.patch('/read-all', controller.markAllAsRead);
  router.patch('/:id/read', controller.markAsRead);
  router.delete('/:id', controller.deleteNotification);

  return router;
}