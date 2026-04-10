import AppError from "../../core/AppError.js";
import { BANK_ACCOUNT_STATUS } from "./bankAccount.constant.js";

class BankAccountService {
    constructor({ bankAccountRepository, userRepository, transactionManager }) {
        this.bankAccountRepository = bankAccountRepository;
        this.userRepository = userRepository;
        this.transactionManager = transactionManager;
    }

    async addBankAccount(userId, payload) {
        const { bankName, accountNumber, accountName } = payload;

        const existingAccounts = await this.bankAccountRepository.findByAccountNumber(accountNumber, bankName);

        const isSelfDuplicated = existingAccounts.some(
            acc => String(acc.userId) === String(userId) && acc.status !== BANK_ACCOUNT_STATUS.DEPRECATED
        );
        if (isSelfDuplicated) {
            throw new AppError("Tài khoản ngân hàng này đã được liên kết với bạn.", 400);
        }

        const otherUserIds = existingAccounts
            .map(acc => String(acc.userId))
            .filter(id => id !== String(userId));

        const isCrossLinked = otherUserIds.length > 0;
        const crossLinkedToUserIds = isCrossLinked ? [...new Set(otherUserIds)] : [];

        const microDepositAmount = Math.floor(Math.random() * (5000 - 1000 + 1)) + 1000;

        const newAccount = await this.transactionManager.runInTransaction(async (session) => {
            const account = await this.bankAccountRepository.create({
                userId,
                bankName,
                accountNumber,
                accountName,
                microDepositAmount,
                isCrossLinked,
                crossLinkedToUserIds,
                status: BANK_ACCOUNT_STATUS.ACTIVE
            }, session);

            if (isCrossLinked) {
                for (const oldAcc of existingAccounts) {
                    const updatedCrossLinks = [...new Set([...(oldAcc.crossLinkedToUserIds || []).map(String), String(userId)])];
                    await this.bankAccountRepository.updateById(oldAcc._id, {
                        isCrossLinked: true,
                        crossLinkedToUserIds: updatedCrossLinks
                    }, session);
                }
            }

            return account;
        });

        return {
            bankAccountId: newAccount._id,
            message: "Hệ thống đã chuyển một số tiền nhỏ. Vui lòng nhập số tiền nhận được để xác thực.",
            mockAmountForTesting: microDepositAmount,
            isCrossLinkedWarning: isCrossLinked
        };
    }

    async verifyMicroDeposit(userId, bankAccountId, inputAmount) {
        const bankAccount = await this.bankAccountRepository.findById(bankAccountId);

        if (!bankAccount || String(bankAccount.userId) !== String(userId)) {
            throw new AppError("Tài khoản ngân hàng không tồn tại hoặc không thuộc về bạn.", 404);
        }

        if (bankAccount.status !== BANK_ACCOUNT_STATUS.ACTIVE) {
            throw new AppError("Tài khoản ngân hàng không ở trạng thái hoạt động.", 400);
        }

        if (bankAccount.isVerified) {
            throw new AppError("Tài khoản này đã được xác thực.", 400);
        }

        if (bankAccount.microDepositAmount !== inputAmount) {
            throw new AppError("Số tiền xác thực không chính xác.", 400);
        }

        await this.bankAccountRepository.updateById(bankAccountId, {
            isVerified: true,
            microDepositAmount: null
        });

        return { success: true, message: "Xác thực tài khoản ngân hàng thành công." };
    }

    async getMyVerifiedAccounts(userId) {
        const accounts = await this.bankAccountRepository.findVerifiedByUserId(userId);
        return accounts.map(acc => ({
            id: acc._id,
            bankName: acc.bankName,
            accountNumber: acc.accountNumber,
            accountName: acc.accountName,
            createdAt: acc.createdAt
        }));
    }

    async deprecateAccount(userId, bankAccountId) {
        const bankAccount = await this.bankAccountRepository.findById(bankAccountId);

        if (!bankAccount || String(bankAccount.userId) !== String(userId)) {
            throw new AppError("Tài khoản ngân hàng không tồn tại hoặc không thuộc về bạn.", 404);
        }

        await this.bankAccountRepository.updateById(bankAccountId, {
            status: BANK_ACCOUNT_STATUS.DEPRECATED,
            isVerified: false
        });

        return { success: true, message: "Đã hủy liên kết tài khoản ngân hàng." };
    }
}

export default BankAccountService;