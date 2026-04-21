import AppError from './AppError.js';

class MoneyMath {

    static toIntegerAmount(value) {
        const num = Number(value);
        if (isNaN(num)) {
            throw new AppError('[Critical Kế Toán]: Phát hiện dữ liệu tiền tệ không hợp lệ (NaN). Từ chối xử lý.', 500);
        }
        return Math.round(num);
    }

    static add(a, b) {
        return this.toIntegerAmount(this.toIntegerAmount(a) + this.toIntegerAmount(b));
    }

    static subtract(a, b) {
        return this.toIntegerAmount(this.toIntegerAmount(a) - this.toIntegerAmount(b));
    }

    static isEqual(a, b) {
        return this.toIntegerAmount(a) === this.toIntegerAmount(b);
    }


    static calculateForward(netAmount, feeRatePercent) {
        const net = this.toIntegerAmount(netAmount);
        const multiplier = Math.round(feeRatePercent * 1000);
        const platformFee = Math.floor((net * multiplier) / 1000);
        const grossAmount = this.add(net, platformFee);

        return { grossAmount, platformFee };
    }


    static calculateProRata(grossAmount, feeRatePercent) {
        const gross = this.toIntegerAmount(grossAmount);
        const multiplier = Math.round(feeRatePercent * 1000);
        const netAmount = Math.floor((gross * 1000) / (1000 + multiplier));
        const platformFee = this.subtract(gross, netAmount);

        return { netAmount, platformFee };
    }
}

export default MoneyMath;