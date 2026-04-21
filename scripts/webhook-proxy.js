import SmeeClient from 'smee-client';
import 'dotenv/config';

const smeeUrl = process.env.SMEE_WEBHOOK_URL;
const targetUrl = `http://localhost:${process.env.PORT || 5000}/api/v1/transactions/webhook/sepay`;

if (!smeeUrl) {
    console.error('\n❌ [LỖI] Thiếu biến SMEE_WEBHOOK_URL trong file .env');
    console.error('💡 Vui lòng vào https://smee.io/ tạo một channel và thêm vào .env\n');
    process.exit(1);
}

const smee = new SmeeClient({
    source: smeeUrl,
    target: targetUrl,
    logger: console
});

console.log('\n=============================================');
console.log('📡 KHỞI ĐỘNG SMEE WEBHOOK PROXY');
console.log(`📥 Lắng nghe từ: ${smeeUrl}`);
console.log(`➡️  Chuyển tiếp đến: ${targetUrl}`);
console.log('=============================================\n');

const events = smee.start();

process.on('SIGINT', () => {
    events.close();
    console.log('\n🛑 [SMEE PROXY] Đã ngắt kết nối an toàn.');
    process.exit(0);
});