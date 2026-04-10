import ApiResponse from "../../core/Response.js";
import AppError from "../../core/AppError.js";

class TransactionController {
    constructor({ transactionService }) {
        this.transactionService = transactionService;
    }

    donate = async (req, res, next) => {
        try {
            const donorId = req.user.userId;
            const result = await this.transactionService.initiateDonation(donorId, req.body);
            return ApiResponse.created(res, result, "Tạo liên kết thanh toán thành công");
        } catch (error) {
            next(error);
        }
    };


    payosWebhook = async (req, res, next) => {
        try {
            await this.transactionService.handlePayosWebhook(req.body);

            return res.status(200).json({ error: 0, message: "Ok", data: null });
        } catch (error) {
            console.error(`[PayOS Webhook Error]`, error.message);

            if (error instanceof AppError && error.statusCode === 400) {
                return res.status(400).json({ error: -1, message: "Invalid Signature", data: null });
            }

            return res.status(200).json({ error: 0, message: "Acknowledged with internal error", data: null });
        }
    };

    requestRefund = async (req, res, next) => {
        try {
            const userId = req.user.userId;
            const transactionId = req.params.id;
            const result = await this.transactionService.processUserRefundRequest(userId, transactionId);
            return ApiResponse.success(res, result, "Yêu cầu hoàn tiền đã được xử lý. Tiền đã cộng vào Ví của bạn.");
        } catch (error) {
            next(error);
        }
    };

    withdrawWallet = async (req, res, next) => {
        try {
            const userId = req.user.userId;
            const result = await this.transactionService.processWalletWithdrawal(userId, req.body);
            return ApiResponse.created(res, result, "Đã tạo lệnh rút tiền. Kế toán sẽ xử lý trong 1-3 ngày làm việc.");
        } catch (error) {
            next(error);
        }
    };
}

export default TransactionController;