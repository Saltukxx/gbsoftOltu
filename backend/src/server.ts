import { server } from './app';
import { logger } from '@/services/logger';
import { connectDatabase } from '@/db';

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || 'localhost';

const startServer = async () => {
  try {
    // Initialize database connection
    await connectDatabase();
    
    server.listen(PORT, () => {
      logger.info(`🚀 Oltu Municipality Backend API running on http://${HOST}:${PORT}`);
      logger.info(`📚 Health check available at: http://${HOST}:${PORT}/health`);
      logger.info(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`🛡️  Database connection pool configured with limits`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err: Error) => {
  logger.error('Unhandled Promise Rejection:', err);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err: Error) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});