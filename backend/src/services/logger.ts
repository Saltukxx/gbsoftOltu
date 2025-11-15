import winston from 'winston';

const logLevel = process.env.LOG_LEVEL || 'info';
const logFormat = process.env.LOG_FORMAT || 'json';

const customFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  logFormat === 'json' 
    ? winston.format.json()
    : winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
);

export const logger = winston.createLogger({
  level: logLevel,
  format: customFormat,
  defaultMeta: { service: 'oltu-backend' },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: logFormat === 'json' 
        ? customFormat
        : winston.format.combine(
            winston.format.colorize(),
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
              return `${timestamp} [${service}] ${level}: ${message} ${
                Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
              }`;
            })
          )
    }),
    
    // File transport for errors
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
    }),
    
    // File transport for all logs
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
    }),
  ],
});

// Create logs directory if it doesn't exist
import { promises as fs } from 'fs';
import path from 'path';

const logsDir = path.join(process.cwd(), 'logs');
fs.mkdir(logsDir, { recursive: true }).catch((err) => {
  console.error('Failed to create logs directory:', err);
});