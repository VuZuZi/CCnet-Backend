import { PayOS } from '@payos/node';
import AppError from '../AppError.js';

class PayosProvider {
    constructor({ config }) {
        this.config = config.payos;

        if (!this.config?.clientId || !this.config?.apiKey || !this.config?.checksumKey) {
            throw new Error('[PayosProvider] Thiếu cấu hình PayOS trong Environment Variables.');
        }

        this.payos = new PayOS({
            clientId: this.config.clientId,
            apiKey: this.config.apiKey,
            checksumKey: this.config.checksumKey
        });

        console.log('[Payment] 💳 PayOS Provider initialized successfully. API Keys loaded.');
    }

    async createPaymentLink({ orderCode, amount, description, returnUrl, cancelUrl }) {
        try {
            const body = {
                orderCode,
                amount,
                description,
                returnUrl,
                cancelUrl,
            };

            const response = await this.payos.paymentRequests.create(body);

            return {
                checkoutUrl: response.checkoutUrl,
                paymentLinkId: response.paymentLinkId,
                qrCode: response.qrCode,
                status: response.status
            };
        } catch (error) {
            throw new AppError(`Lỗi khởi tạo cổng thanh toán PayOS: ${error.message}`, 502);
        }
    }

    verifyWebhookData(webhookBody) {
        try {
            const data = this.payos.webhooks.verify(webhookBody);
            return data;
        } catch (error) {
            throw new AppError(`Sai chữ ký Webhook từ PayOS. Giao dịch bị từ chối: ${error.message}`, 400);
        }
    }

    async cancelPaymentLink(orderCode, cancellationReason = 'User cancelled') {
        try {
            const response = await this.payos.paymentRequests.cancel(orderCode, { cancellationReason });
            return response;
        } catch (error) {
            throw new AppError(`Không thể hủy giao dịch PayOS: ${error.message}`, 502);
        }
    }
}

export default PayosProvider;