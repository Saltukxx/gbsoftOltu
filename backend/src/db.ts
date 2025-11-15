import { PrismaClient } from "@prisma/client";
import { logger } from '@/services/logger';

// Database configuration with connection pooling and security settings
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: [
    {
      emit: 'event',
      level: 'query',
    },
    {
      emit: 'event',
      level: 'error',
    },
    {
      emit: 'event',
      level: 'warn',
    },
  ],
  errorFormat: 'pretty',
});

// Log database queries in development
if (process.env.NODE_ENV === 'development') {
  prisma.$on('query', (e) => {
    logger.debug('Database Query:', {
      query: e.query,
      params: e.params,
      duration: e.duration,
    });
  });
}

// Log database errors
prisma.$on('error', (e) => {
  logger.error('Database Error:', {
    target: e.target,
    message: e.message,
  });
});

// Log database warnings
prisma.$on('warn', (e) => {
  logger.warn('Database Warning:', {
    target: e.target,
    message: e.message,
  });
});

// Connection lifecycle management
let isShuttingDown = false;

export const connectDatabase = async (): Promise<void> => {
  try {
    await prisma.$connect();
    logger.info('Database connected successfully');
  } catch (error) {
    logger.error('Database connection failed:', error);
    process.exit(1);
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  if (!isShuttingDown) {
    isShuttingDown = true;
    try {
      await prisma.$disconnect();
      logger.info('Database disconnected successfully');
    } catch (error) {
      logger.error('Database disconnection failed:', error);
    }
  }
};

// Graceful shutdown handlers
process.on('SIGINT', async () => {
  await disconnectDatabase();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await disconnectDatabase();
  process.exit(0);
});

process.on('beforeExit', async () => {
  await disconnectDatabase();
});

export default prisma;

