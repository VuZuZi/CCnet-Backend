class DisbursementSSEService {
    constructor({ redis }) {
        this.redis = redis;

        this.clients = new Map();

        this.subscriber = this.redis.getClient().duplicate();

        this._initSubscriber();
    }

    _initSubscriber() {
        this.subscriber.psubscribe('disbursement_status:*', (err, count) => {
            if (err) console.error('[CTO Alert] Disbursement SSE psubscribe error:', err.message);
        });
        this.subscriber.psubscribe('disbursement:*:status', (err, count) => {
            if (err) console.error('[CTO Alert] Disbursement SSE psubscribe error:', err.message);
        });

        this.subscriber.on('pmessage', (pattern, channel, message) => {
            const parts = channel.split(':');
            let requestId = null;

            if (pattern === 'disbursement_status:*') {
                requestId = parts[1];
            } else if (pattern === 'disbursement:*:status') {
                requestId = parts[1];
            }

            if (!requestId) return;

            const activeClients = this.clients.get(requestId);
            if (activeClients && activeClients.size > 0) {
                activeClients.forEach(res => {
                    res.write(`data: ${message}\n\n`);

                    try {
                        const data = JSON.parse(message);
                        if (['COMPLETED', 'HOLD', 'REJECTED'].includes(data.status)) {
                            res.end();
                            activeClients.delete(res);
                        }
                    } catch (e) {
                        console.error("[SSE] JSON Parse Error in disbursement stream:", e.message);
                    }
                });

                if (activeClients.size === 0) {
                    this.clients.delete(requestId);
                }
            }
        });
    }

    async streamDisbursementStatus(requestId, currentRequest, res, req) {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive'
        });
        res.write(`retry: 10000\n\n`);

        if (['COMPLETED', 'HOLD', 'REJECTED'].includes(currentRequest.status)) {
            res.write(`data: ${JSON.stringify({
                requestId: requestId,
                status: currentRequest.status,
                approvedAmount: currentRequest.approvedAmount
            })}\n\n`);
            return res.end();
        }

        if (!this.clients.has(requestId)) {
            this.clients.set(requestId, new Set());
        }
        this.clients.get(requestId).add(res);

        const heartbeat = setInterval(() => {
            res.write(`data: {}\n\n`);
        }, 25000);

        let cleaned = false;
        const doCleanup = () => {
            if (!cleaned) {
                cleaned = true;
                clearInterval(heartbeat);

                const activeClients = this.clients.get(requestId);
                if (activeClients) {
                    activeClients.delete(res);
                    if (activeClients.size === 0) {
                        this.clients.delete(requestId);
                    }
                }
            }
        };

        req.on('close', doCleanup);
        req.on('end', doCleanup);
        req.on('error', doCleanup);
    }
}

export default DisbursementSSEService;
