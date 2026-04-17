import ApiResponse from "../../core/Response.js";

class WalletController {
    constructor({ walletService }) {
        this.walletService = walletService;
    }

    getMyWallet = async (req, res, next) => {
        try {
            const userId = req.user.userId;
            const result = await this.walletService.getMyWalletInfo(userId);
            return ApiResponse.success(res, result, "Lấy thông tin ví thành công.");
        } catch (error) {
            next(error);
        }
    };

    getWalletHistory = async (req, res, next) => {
        try {
            const userId = req.user.userId;
            const result = await this.walletService.getWalletHistory(userId, req.query);
            return ApiResponse.success(res, result, "Lấy lịch sử giao dịch ví thành công.");
        } catch (error) {
            next(error);
        }
    };
}

export default WalletController;