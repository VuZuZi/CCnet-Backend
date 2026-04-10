import AppError from "../../core/AppError.js";

class WalletService {
    constructor({ walletRepository, transactionRepository }) {
        this.walletRepository = walletRepository;
        this.transactionRepository = transactionRepository;
    }

    async getMyWalletInfo(userId) {
        const wallet = await this.walletRepository.findByUserId(userId);
        
        return {
            id: wallet._id,
            balance: wallet.balance,
            currency: wallet.currency,
            status: wallet.status,
            createdAt: wallet.createdAt
        };
    }

    async getWalletHistory(userId, queryParams) {
        const { page, limit } = queryParams;
        const skip = (page - 1) * limit;

        const result = await this.transactionRepository.findWalletTransactions(userId, skip, limit);

        const formattedHistory = result.transactions.map(tx => {
            const isIncome = ['WALLET_DEPOSIT', 'USER_REFUND_REQUEST'].includes(tx.type);

            return {
                id: tx._id,
                type: tx.type,
                amount: tx.amount,
                currency: tx.currency,
                status: tx.status,
                direction: isIncome ? 'IN' : 'OUT',
                metadata: tx.gatewayResponse || null,
                createdAt: tx.createdAt
            };
        });

        const totalPages = Math.ceil(result.total / limit);

        return {
            history: formattedHistory,
            pagination: {
                totalItems: result.total,
                currentPage: page,
                totalPages,
                hasNextPage: page < totalPages
            }
        };
    }
}

export default WalletService;