import winston from 'winston';

class WinstonLogger {
    constructor({ config }) {
        this.logger = winston.createLogger({
            level: config.env === 'production' ? 'info' : 'debug',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            ),
            transports: [
                new winston.transports.Console()
            ]
        });
    }

    getLogger() {
        return this.logger;
    }
}

export default WinstonLogger;