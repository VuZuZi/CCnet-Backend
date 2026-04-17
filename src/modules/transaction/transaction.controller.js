import ApiResponse from "../../core/Response.js";
import AppError from "../../core/AppError.js";

class TransactionController {
    constructor({ transactionService, suspenseService, transactionSseService }) {
        this.transactionService = transactionService;
        this.suspenseService = suspenseService;
        this.transactionSseService = transactionSseService;
    }

    donate = async (req, res, next) => {
        try {
            const donorId = req.user.userId;
            const result = await this.transactionService.initiateDonation(donorId, req.body);
            return ApiResponse.created(res, result, "Tạo liên kết thanh toán thành công");
        } catch (error) { next(error); }
    };

    sepayWebhook = async (req, res, next) => {
        try {
            await this.transactionService.handleSepayWebhook(req.headers, req.body);
            return res.status(200).json({ error: 0, message: "Ok", data: null });
        } catch (error) {
            console.error(`[SePay Webhook Error]`, error.message);
            if (error instanceof AppError) {
                if (error.statusCode === 429 || error.statusCode === 409) {
                    return res.status(error.statusCode).json({ error: -1, message: error.message, data: null });
                }
                if (error.statusCode === 403) {
                    return res.status(403).json({ error: -1, message: "Invalid Webhook Signature", data: null });
                }
            }
            return res.status(503).json({ error: -1, message: "Service Unavailable", data: null });
        }
    };

    requestRefund = async (req, res, next) => {
        try {
            const result = await this.transactionService.processUserRefundRequest(req.user.userId, req.params.id);
            return ApiResponse.success(res, result, "Yêu cầu hoàn tiền đã được xử lý. Tiền đã cộng vào Ví của bạn.");
        } catch (error) { next(error); }
    };

    withdrawWallet = async (req, res, next) => {
        try {
            const result = await this.transactionService.processWalletWithdrawal(req.user.userId, req.body);
            return ApiResponse.created(res, result, "Đã tạo lệnh rút tiền. Kế toán sẽ xử lý trong 1-3 ngày làm việc.");
        } catch (error) { next(error); }
    };

    getMyDonations = async (req, res, next) => {
        try {
            const result = await this.transactionService.getUserDonationHistory(req.user.userId, req.query);
            return ApiResponse.success(res, result, "Lấy danh sách lịch sử ủng hộ thành công");
        } catch (error) { next(error); }
    };

    getProjectDonors = async (req, res, next) => {
        try {
            const result = await this.transactionService.getProjectDonors(req.params.projectId, req.query);
            return ApiResponse.success(res, result, "Lấy danh sách nhà tài trợ thành công");
        } catch (error) { next(error); }
    };

    getTransactionStatus = async (req, res, next) => {
        try {
            const result = await this.transactionService.getTransactionStatus(req.user.userId, req.params.id);
            return ApiResponse.success(res, result, "Lấy trạng thái giao dịch thành công");
        } catch (error) { next(error); }
    };

    updateMessage = async (req, res, next) => {
        try {
            const result = await this.transactionService.updateDonationMessage(req.user.userId, req.params.id, req.body);
            return ApiResponse.success(res, result, "Cập nhật lời nhắn thành công");
        } catch (error) { next(error); }
    };

    confirmPaymentIntent = async (req, res, next) => {
        try {
            const result = await this.transactionService.confirmPaymentIntent(req.user.userId, req.params.id);
            return ApiResponse.success(res, result, "Ghi nhận ý định thanh toán thành công");
        } catch (error) { next(error); }
    };

    submitClaim = async (req, res, next) => {
        try {
            const result = await this.suspenseService.submitClaimRequest(req.user.userId, req.body);
            return ApiResponse.success(res, result, "Gửi yêu cầu tra soát thành công");
        } catch (error) { next(error); }
    };

    getSuspenseTransactions = async (req, res, next) => {
        try {
            const result = await this.suspenseService.getSuspenseList(req.query);
            return ApiResponse.success(res, result, "Lấy danh sách tiền treo thành công");
        } catch (error) { next(error); }
    };

    approveSuspenseClaim = async (req, res, next) => {
        try {
            const payload = { ...req.body, suspenseId: req.params.id }; 
            const result = await this.suspenseService.approveClaimRequest(req.user.userId, payload);
            return ApiResponse.success(res, result, "Phê duyệt tra soát thành công");
        } catch (error) { next(error); }
    };

    streamTransaction = async (req, res, next) => {
        try {
            const userId = req.user.userId;
            const transactionId = req.params.id;
            
            const currentTx = await this.transactionService.getTransactionStatus(userId, transactionId);

            await this.transactionSseService.streamPaymentStatus(transactionId, currentTx, res, req);
        } catch (error) {
            next(error);
        }
    };
}

export default TransactionController;