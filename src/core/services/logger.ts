import fs from 'fs';
import winston from 'winston';

try {
    if (!fs.existsSync('logs')) {
        fs.mkdirSync('logs', { recursive: true });
    }
} catch {
    // Directory creation failed. File transport may fall back to an error at write time.
}

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'socketio-server' },
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.Console({ format: winston.format.simple() })
    ]
});

export default logger;
