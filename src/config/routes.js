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
import transactionRoutes from "../modules/transaction/transaction.routes.js";
import bankAccountRoutes from "../modules/bankAccount/bankAccount.routes.js";
import walletRoutes from "../modules/wallet/wallet.routes.js";
import adminFinanceRoutes from '../modules/admin/admin-finance.routes.js';
import milestoneEvidenceRoutes from '../modules/project/milestone-evidence.routes.js';
import {
  organizerRequestUserRouter,
  organizerRequestAdminRouter,
} from "../modules/organizerRequest/organizerRequest.routes.js";

import disbursementRoutes from "../modules/disbursement/disbursement.routes.js";

const API_PREFIX = "/api/v1";

export const configureRoutes = (app, { notificationModule }) => {
  const routes = [
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
    { path: "/notifications", handler: notificationModule.router },
    { path: "/transactions", handler: transactionRoutes },
    { path: "/bank-accounts", handler: bankAccountRoutes },
    { path: "/wallets", handler: walletRoutes },
    { path: "/admin-finance", handler: adminFinanceRoutes },
    { path: "/disbursement", handler: disbursementRoutes },
    { path: "/milestone-evidence", handler: milestoneEvidenceRoutes },

  ];

  routes.forEach(({ path, handler }) => {
    app.use(`${API_PREFIX}${path}`, handler);
    console.log(`Route registered: ${API_PREFIX}${path}`);
  });
};