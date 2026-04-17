import { DOMAIN_EVENTS } from "../../config/notification.js";
import { PROJECT_STATUS } from "../project/project.constant.js";

export const registerTransactionListeners = ({ eventBus, transactionService }) => {
    eventBus.on(DOMAIN_EVENTS.PROJECT_STATUS_UPDATED, async (payload) => {
        if (payload.status === PROJECT_STATUS.FAILED_FUNDING) {
            console.log(`[Transaction Listener] Phát hiện dự án ${payload.projectId} FAILED_FUNDING. Khởi chạy Auto-Refund...`);
            
            try {
                await transactionService.processAutoRefundToWallet(payload.projectId);
            } catch (err) {
                console.error(`[CRITICAL] Auto-Refund Job Error:`, err.message);
            }
        }
    });
};