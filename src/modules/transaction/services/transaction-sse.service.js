class TransactionSSEService {
    constructor({ redis }) {
        this.redis = redis;

        this.clients = new Map();

        this.subscriber = this.redis.getClient().duplicate();

        this._initSubscriber();
    }

    _initSubscriber() {
        this.subscriber.psubscribe('tx_status:*', (err, count) => {
            if (err) console.error('[CTO Alert] SSE Multiplexer psubscribe error:', err.message);
        });

        this.subscriber.on('pmessage', (pattern, channel, message) => {
            const txId = channel.split(':')[1];
            if (!txId) return;

            const activeClients = this.clients.get(txId);
            if (activeClients && activeClients.size > 0) {
                activeClients.forEach(res => {
                    res.write(`data: ${message}\n\n`);

                    try {
                        const data = JSON.parse(message);
                        if (['COMPLETED', 'FAILED', 'EXPIRED'].includes(data.status)) {
                            res.end();
                            activeClients.delete(res);
                        }
                    } catch (e) {
                        console.error("[SSE] JSON Parse Error in stream:", e.message);
                    }
                });

                if (activeClients.size === 0) {
                    this.clients.delete(txId);
                }
            }
        });
    }

    async streamPaymentStatus(transactionId, currentTx, res, req) {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive'
        });
        res.write(`retry: 10000\n\n`);

        if (['COMPLETED', 'FAILED', 'EXPIRED'].includes(currentTx.status)) {
            res.write(`data: ${JSON.stringify({
                transactionId: transactionId,
                status: currentTx.status,
                netAmount: currentTx.netAmount
            })}\n\n`);
            return res.end();
        }

        if (!this.clients.has(transactionId)) {
            this.clients.set(transactionId, new Set());
        }
        this.clients.get(transactionId).add(res);

        const heartbeat = setInterval(() => {
            res.write(`data: {}\n\n`);
        }, 25000);

        let cleaned = false;
        const doCleanup = () => {
            if (!cleaned) {
                cleaned = true;
                clearInterval(heartbeat);

                const activeClients = this.clients.get(transactionId);
                if (activeClients) {
                    activeClients.delete(res);
                    if (activeClients.size === 0) {
                        this.clients.delete(transactionId);
                    }
                }
            }
        };

        req.on('close', doCleanup);
        req.on('end', doCleanup);
        req.on('error', doCleanup);
    }
}

export default TransactionSSEService;