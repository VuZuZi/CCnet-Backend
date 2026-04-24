class AppLogger {
    constructor({ winstonLogger, requestId = 'SYSTEM_WORKER' }) {
        this.logger = winstonLogger.getLogger();
        this.requestId = requestId;
    }

    info(message, meta = {}) {
        this.logger.info(message, { requestId: this.requestId, ...meta });
    }

    error(message, meta = {}) {
        this.logger.error(message, { requestId: this.requestId, ...meta });
    }

    warn(message, meta = {}) {
        this.logger.warn(message, { requestId: this.requestId, ...meta });
    }

    debug(message, meta = {}) {
        this.logger.debug(message, { requestId: this.requestId, ...meta });
    }

    aiLog({ provider, model, latency, tokens, isFallback = false, errorMsg = null, ...rest }) {
        const logPayload = {
            type: 'AI_GATEWAY',
            requestId: this.requestId,
            provider,
            model,
            latency_ms: latency,
            tokens,
            isFallback,
            ...rest
        };

        if (errorMsg) {
            logPayload.errorMsg = errorMsg;
            this.logger.error('AI Request Failed', logPayload);
        } else {
            this.logger.info('AI Request Success', logPayload);
        }
    }
}

export default AppLogger;