import ApiResponse from "../../core/Response.js";

class BankAccountController {
    constructor({ bankAccountService }) {
        this.bankAccountService = bankAccountService;
    }

    addBankAccount = async (req, res, next) => {
        try {
            const userId = req.user.userId;
            const result = await this.bankAccountService.addBankAccount(userId, req.body);
            return ApiResponse.created(res, result, "Đã thêm và xác thực thẻ ngân hàng thành công.");
        } catch (error) {
            next(error);
        }
    };

    verifyBankAccount = async (req, res, next) => {
        try {
            const userId = req.user.userId;
            const bankAccountId = req.params.id;
            const result = await this.bankAccountService.verifyMicroDeposit(userId, bankAccountId, req.body.amount);
            return ApiResponse.success(res, result, "Xác thực thẻ thành công.");
        } catch (error) {
            next(error);
        }
    };

    getMyAccounts = async (req, res, next) => {
        try {
            const userId = req.user.userId;
            const result = await this.bankAccountService.getMyVerifiedAccounts(userId);
            return ApiResponse.success(res, result, "Lấy danh sách thẻ thành công.");
        } catch (error) {
            next(error);
        }
    };

    deprecateAccount = async (req, res, next) => {
        try {
            const userId = req.user.userId;
            const bankAccountId = req.params.id;
            const result = await this.bankAccountService.deprecateAccount(userId, bankAccountId);
            return ApiResponse.success(res, result, "Đã gỡ thẻ.");
        } catch (error) {
            next(error);
        }
    };
}

export default BankAccountController;