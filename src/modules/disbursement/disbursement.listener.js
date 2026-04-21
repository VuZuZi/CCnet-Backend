export const registerDisbursementListeners = ({ eventBus, disbursementService }) => {
    eventBus.on('WEBHOOK_DISBURSEMENT_OUTBOUND', async (payload) => {
        const { requestId, amount, bankTransactionRef } = payload;
        console.log(`[Disbursement Listener] 🎧 Hứng Event Giải ngân. RequestId: ${requestId}, Số tiền: ${amount}`);
        
        try {
            await disbursementService.confirmAutoTransfer(requestId, bankTransactionRef, amount);
        } catch (err) {
            console.error(`[CRITICAL] 🛑 Lỗi xử lý chốt đơn Auto-Transfer:`, err.message);
        }
    });
};