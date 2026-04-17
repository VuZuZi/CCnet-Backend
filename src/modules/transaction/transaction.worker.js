import { getContainer } from "../../container/index.js";

export const initTransactionWorkers = () => {
    const container = getContainer();
    const jobQueue = container.resolve("jobQueue");

    jobQueue.registerWorker("financial-reconciliation", async (job) => {
        try {
            if (job.name === "sweep-expired-transactions") {
                const transactionRepository = container.resolve("transactionRepository");
                const thresholdDate = new Date(Date.now() - 24 * 60 * 60 * 1000); 
                const result = await transactionRepository.expirePendingTransactions(thresholdDate);
                console.log(`[Sweeper Job] ✅ Đã dọn dẹp ${result.modifiedCount} giao dịch rác.`);
                return { success: true, modifiedCount: result.modifiedCount };
            }
            
            if (job.name === "sync-missing-transactions") {
                const suspenseService = container.resolve("suspenseService");
                const result = await suspenseService.syncMissingTransactions(new Date());
                console.log(`[Re-sync Job] ✅ Đã check ${result.processed} giao dịch IN. Phục hồi: ${result.recovered}`);
                return { success: true, ...result };
            }

            if (job.name === "process-auto-refund") {
                const transactionService = container.resolve("transactionService");
                const result = await transactionService.processAutoRefundToWallet(job.data.projectId);
                console.log(`[Auto-Refund Job] ✅ Hoàn tiền dự án ${job.data.projectId}: ${result.processedCount} giao dịch thành công.`);
                return result;
            }

        } catch (error) {
            console.error(`[Worker Job: ${job.name}] ❌ LỖI HỆ THỐNG:`, error.message);
            throw error;
        }
    });

    jobQueue.addJob(
        "financial-reconciliation",
        "sweep-expired-transactions",
        {},
        { repeat: { pattern: "0 * * * *" }, jobId: "unique-hourly-sweeper-job" }
    );

    jobQueue.addJob(
        "financial-reconciliation",
        "sync-missing-transactions",
        {},
        { repeat: { pattern: "*/30 * * * *" }, jobId: "unique-sync-missing-tx-job" }
    );

    console.log("[Worker] Transaction workers (Sweeper, Sync & Auto-Refund) đã khởi chạy thành công.");
};