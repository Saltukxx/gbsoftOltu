import { logger } from '@/services/logger';

interface EnvConfig {
  [key: string]: {
    required: boolean;
    default?: string;
    description: string;
  };
}

const envConfig: EnvConfig = {
  NODE_ENV: {
    required: true,
    default: 'development',
    description: 'Application environment',
  },
  PORT: {
    required: true,
    default: '3001',
    description: 'Server port',
  },
  DATABASE_URL: {
    required: true,
    description: 'PostgreSQL database connection string',
  },
  REDIS_URL: {
    required: false,
    default: 'redis://localhost:6379',
    description: 'Redis connection string',
  },
  JWT_SECRET: {
    required: true,
    description: 'JWT signing secret',
  },
  JWT_REFRESH_SECRET: {
    required: true,
    description: 'JWT refresh token signing secret',
  },
  AI_SERVICE_URL: {
    required: false,
    default: 'http://localhost:8000',
    description: 'AI service endpoint',
  },
  CORS_ORIGIN: {
    required: false,
    default: 'http://localhost:3000',
    description: 'Allowed CORS origin',
  },
  SESSION_SECRET: {
    required: false,
    description: 'Session signing secret (separate from JWT secret)',
  },
  MQTT_USERNAME: {
    required: false,
    description: 'MQTT broker username',
  },
  MQTT_PASSWORD: {
    required: false,
    description: 'MQTT broker password',
  },
};

export function validateEnvironment(): void {
  const errors: string[] = [];
  const warnings: string[] = [];

  logger.info('Validating environment configuration...');

  for (const [key, config] of Object.entries(envConfig)) {
    const value = process.env[key];

    if (!value) {
      if (config.required) {
        errors.push(`Missing required environment variable: ${key} - ${config.description}`);
      } else if (config.default) {
        process.env[key] = config.default;
        warnings.push(`Using default value for ${key}: ${config.default}`);
      } else {
        warnings.push(`Optional environment variable not set: ${key} - ${config.description}`);
      }
    }
  }

  // Log warnings
  if (warnings.length > 0) {
    warnings.forEach(warning => logger.warn(warning));
  }

  // Check for critical errors
  if (errors.length > 0) {
    logger.error('Environment validation failed:');
    errors.forEach(error => logger.error(`  ${error}`));
    logger.error('Please check your .env file and ensure all required variables are set.');
    process.exit(1);
  }

  // Enhanced production environment validation
  if (process.env.NODE_ENV === 'production') {
    validateProductionSecurity(errors);
  }

  logger.info('Environment validation completed successfully');
}

export function getEnvWithDefault(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

export function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value;
}

/**
 * Enhanced production security validation
 */
function validateProductionSecurity(errors: string[]): void {
  logger.info('Performing enhanced production security validation...');

  // Validate JWT secrets are strong and not default values
  if (process.env.JWT_SECRET?.includes('change-in-production') || 
      process.env.JWT_SECRET === 'your-secret-key' ||
      process.env.JWT_SECRET === 'secret') {
    errors.push('JWT_SECRET must be changed from default value in production');
  }

  if (process.env.JWT_REFRESH_SECRET?.includes('change-in-production') ||
      process.env.JWT_REFRESH_SECRET === 'your-refresh-secret' ||
      process.env.JWT_REFRESH_SECRET === 'secret') {
    errors.push('JWT_REFRESH_SECRET must be changed from default value in production');
  }

  // Validate JWT secret strength (minimum 32 characters)
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters long in production');
  }

  if (process.env.JWT_REFRESH_SECRET && process.env.JWT_REFRESH_SECRET.length < 32) {
    errors.push('JWT_REFRESH_SECRET must be at least 32 characters long in production');
  }

  // Ensure separate session secret
  if (!process.env.SESSION_SECRET) {
    logger.warn('SESSION_SECRET not set, falling back to JWT_SECRET (not recommended)');
  } else if (process.env.SESSION_SECRET === process.env.JWT_SECRET) {
    errors.push('SESSION_SECRET should be different from JWT_SECRET in production');
  }

  // Validate database URL doesn't contain default credentials
  if (process.env.DATABASE_URL?.includes('postgres://postgres:password@') ||
      process.env.DATABASE_URL?.includes('postgres://user:pass@')) {
    errors.push('DATABASE_URL contains default credentials - must be changed for production');
  }

  // Ensure HTTPS in production
  if (process.env.CORS_ORIGIN?.startsWith('http://') && 
      !process.env.CORS_ORIGIN.includes('localhost')) {
    logger.warn('CORS_ORIGIN uses HTTP in production - HTTPS recommended for security');
  }

  // MQTT Security validation
  if (!process.env.MQTT_USERNAME || !process.env.MQTT_PASSWORD) {
    errors.push('MQTT_USERNAME and MQTT_PASSWORD are required in production for broker security');
  }

  // Validate Redis connection security
  if (process.env.REDIS_URL && process.env.REDIS_URL.includes('redis://redis:6379')) {
    logger.warn('Using default Redis connection - ensure Redis is properly secured');
  }

  // AI Service security
  if (process.env.AI_SERVICE_URL?.includes('localhost') || 
      process.env.AI_SERVICE_URL?.includes('127.0.0.1')) {
    logger.warn('AI_SERVICE_URL points to localhost in production - verify this is intentional');
  }

  // Check for common insecure patterns
  const envVars = Object.keys(process.env);
  const sensitiveDefaults = ['admin', 'password', 'secret', '123456', 'changeme'];
  
  for (const envVar of envVars) {
    const value = process.env[envVar]?.toLowerCase();
    if (value && sensitiveDefaults.some(pattern => value.includes(pattern))) {
      logger.warn(`Environment variable ${envVar} may contain insecure default value`);
    }
  }

  // Security headers validation
  logger.info('Production security recommendations:');
  logger.info('- Ensure proper firewall configuration');
  logger.info('- Use HTTPS/TLS for all external connections');
  logger.info('- Regularly rotate API keys and secrets');
  logger.info('- Monitor security audit logs');
  logger.info('- Keep dependencies updated');

  if (errors.length > 0) {
    logger.error('Production security validation failed:');
    errors.forEach(error => logger.error(`  ${error}`));
    logger.error('Fix security issues before deploying to production.');
    process.exit(1);
  }

  logger.info('Production security validation passed');
}