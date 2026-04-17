import crypto from 'crypto';
import AppError from '../AppError.js';
import { getBankByShortName } from '../../modules/bankAccount/bankAccount.constant.js';

class SepayProvider {
    constructor({ config }) {
        this.config = config.sepay;

        console.log('\n=============================================');
        console.log('🚀 INITIALIZING SEPAY PAYMENT PROVIDER 🚀');

        let hasError = false;

        if (!this.config?.bankName || !this.config?.accountNumber) {
            console.error('❌ [LỖI] Thiếu cấu hình Ngân hàng (SEPAY_BANK_NAME hoặc SEPAY_ACCOUNT_NUMBER).');
            hasError = true;
        }

        this.bankInfo = getBankByShortName(this.config?.bankName);
        if (!this.bankInfo && this.config?.bankName) {
            console.error(`❌ [LỖI] Ngân hàng cấu hình (${this.config.bankName}) không được hỗ trợ hoặc sai chính tả.`);
            hasError = true;
        }

        if (!this.config?.webhookSecret) {
            console.error('❌ [LỖI CẢNH BÁO BẢO MẬT] Thiếu SEPAY_WEBHOOK_SECRET. Webhook sẽ từ chối mọi giao dịch!');
            hasError = true;
        }

        if (!this.config?.apiToken) {
            console.warn('⚠️ [CẢNH BÁO] Thiếu SEPAY_API_TOKEN. Job đối soát Delta 23:59 sẽ không hoạt động.');
        }

        if (!hasError) {
            console.log(`✅ Bank Account: ${this.bankInfo.shortName} (BIN: ${this.bankInfo.bin}) - ${this.config.accountNumber}`);
            console.log('✅ Webhook Security: Kích hoạt (HMAC Verification Ready)');
            console.log('✅ SePay Provider is LIVE and READY for transactions.');
        } else {
            console.log('🛑 SePay Provider khởi tạo thất bại do thiếu cấu hình gốc.');
            throw new AppError('Hệ thống tài chính (SePay) khởi tạo thất bại. Vui lòng kiểm tra Server Logs.', 500);
        }
        console.log('=============================================\n');
    }

    async createPaymentLink({ orderCode, amount, description }) {
        try {
            const response = await fetch('https://api.vietqr.io/v2/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    accountNo: String(this.config.accountNumber),
                    accountName: this.config.accountName || "QUY THIEN NGUYEN",
                    acqId: String(this.bankInfo.bin),
                    amount: amount,
                    addInfo: description,
                    format: 'text'
                })
            });

            const result = await response.json();

            if (result.code !== '00') {
                throw new Error(result.desc || "Lỗi từ cổng VietQR quốc gia");
            }

            return {
                paymentLinkId: String(orderCode),
                qrCode: result.data.qrCode,
                transferMemo: description,
                status: 'PENDING'
            };
        } catch (error) {
            throw new AppError(`Lỗi khởi tạo mã VietQR tĩnh: ${error.message}`, 502);
        }
    }

    verifyWebhookData(reqHeader, webhookBody) {
        try {
            const authHeader = reqHeader['authorization'] || reqHeader['Authorization'];

            if (!authHeader || !authHeader.startsWith('Apikey ')) {
                throw new AppError('Không tìm thấy Token xác thực trong Header', 403);
            }

            const providedToken = authHeader.split(' ')[1];

            const isMatch = crypto.timingSafeEqual(
                Buffer.from(providedToken),
                Buffer.from(this.config.webhookSecret)
            );

            if (!isMatch) {
                throw new AppError('Sai chữ ký Webhook từ SePay. Giao dịch bị từ chối.', 403);
            }

            return webhookBody;
        } catch (error) {
            if (error instanceof AppError) throw error;
            throw new AppError(`Lỗi xử lý xác thực Webhook: ${error.message}`, 500);
        }
    }

    async fetchTransactionsList(date = new Date()) {
        try {
            if (!this.config.apiToken) {
                throw new AppError('Thiếu SEPAY_API_TOKEN để gọi lịch sử giao dịch', 500);
            }

            const formatter = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'Asia/Ho_Chi_Minh',
                year: 'numeric', month: '2-digit', day: '2-digit'
            });
            const dateString = formatter.format(date);

            let allTransactions = [];
            let currentPage = 1;
            const limit = 1000;
            let hasMore = true;

            while (hasMore) {
                const url = `https://my.sepay.vn/userapi/transactions/list?transaction_date_min=${dateString}%2000:00:00&transaction_date_max=${dateString}%2023:59:59&limit=${limit}&page=${currentPage}`;

                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${this.config.apiToken}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) throw new Error(`SePay API HTTP Status: ${response.status}`);

                const data = await response.json();
                const fetchedTxs = data.transactions || [];
                allTransactions = allTransactions.concat(fetchedTxs);

                if (fetchedTxs.length < limit) {
                    hasMore = false;
                } else {
                    currentPage++;
                }
            }

            return allTransactions.filter(tx => String(tx.account_number) === String(this.config.accountNumber));
        } catch (error) {
            throw new AppError(`Lỗi khi lấy lịch sử giao dịch SePay: ${error.message}`, 502);
        }
    }
}

export default SepayProvider;