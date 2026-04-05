import { Router } from 'express';
import { getContainer } from '../../container/index.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { groupAvatarUpload, messageUpload } from './chat.upload.js';

const router = Router();

function resolveChatController() {
  return getContainer().resolve('chatController');
}

function execute(action) {
  return (req, res, next) => {
    const controller = resolveChatController();
    return controller[action](req, res, next);
  };
}

router.get('/conversations', authenticate, execute('getConversations'));

router.post(
  '/conversations',
  authenticate,
  groupAvatarUpload,
  execute('createConversation')
);

router.patch(
  '/conversations/:id',
  authenticate,
  groupAvatarUpload,
  execute('updateConversation')
);

router.post('/conversations/:id/members', authenticate, execute('addMembers'));

router.delete(
  '/conversations/:id/members/:participantId',
  authenticate,
  execute('removeMember')
);

router.post('/conversations/:id/leave', authenticate, execute('leaveConversation'));

router.get('/conversations/:id/assets', authenticate, execute('getAssets'));

router.get('/messages/:id', authenticate, execute('getMessages'));
router.post('/messages', authenticate, messageUpload, execute('sendMessage'));
router.patch('/messages/:id/react', authenticate, execute('reactMessage'));
router.patch('/messages/:id/unsend', authenticate, execute('unsendMessage'));

router.patch('/read/:id', authenticate, execute('markAsRead'));
router.get('/files/:filename', authenticate, execute('downloadFile'));

export default router;