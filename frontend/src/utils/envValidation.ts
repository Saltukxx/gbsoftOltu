interface EnvConfig {
  [key: string]: {
    required: boolean;
    default?: string;
    description: string;
  };
}

const envConfig: EnvConfig = {
  VITE_API_URL: {
    required: true,
    default: 'http://localhost:3001',
    description: 'Backend API URL',
  },
  VITE_WS_URL: {
    required: true,
    default: 'ws://localhost:3001',
    description: 'WebSocket server URL',
  },
  VITE_APP_NAME: {
    required: false,
    default: 'Oltu Municipality Platform',
    description: 'Application name',
  },
  VITE_MAPBOX_ACCESS_TOKEN: {
    required: false,
    description: 'Mapbox access token for maps',
  },
};

export function validateEnvironment(): void {
  const warnings: string[] = [];
  const errors: string[] = [];

  console.log('🔍 Validating frontend environment configuration...');

  for (const [key, config] of Object.entries(envConfig)) {
    const value = import.meta.env[key];

    if (!value) {
      if (config.required && !config.default) {
        errors.push(`Missing required environment variable: ${key} - ${config.description}`);
      } else if (!config.required) {
        warnings.push(`Optional environment variable not set: ${key} - ${config.description}`);
      }
    } else if (value.includes('your-') || value.includes('token-here') || 
               (key === 'VITE_MAPBOX_ACCESS_TOKEN' && !value.startsWith('pk.'))) {
      warnings.push(`Environment variable ${key} appears to contain placeholder value or invalid format`);
    }
  }

  // Log warnings
  if (warnings.length > 0) {
    console.warn('⚠️ Environment warnings:');
    warnings.forEach(warning => console.warn(`  ${warning}`));
  }

  // Check for critical errors
  if (errors.length > 0) {
    console.error('❌ Environment validation failed:');
    errors.forEach(error => console.error(`  ${error}`));
    console.error('Please check your .env file and ensure all required variables are set.');
    throw new Error('Environment validation failed');
  }

  console.log('✅ Frontend environment validation completed');
}

export function getEnvWithDefault(key: string, defaultValue: string): string {
  return import.meta.env[key] || defaultValue;
}

export function getRequiredEnv(key: string): string {
  const value = import.meta.env[key];
  if (!value) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value;
}

// Export commonly used environment variables
export const env = {
  API_URL: getEnvWithDefault('VITE_API_URL', 'http://localhost:3001'),
  WS_URL: getEnvWithDefault('VITE_WS_URL', 'ws://localhost:3001'),
  APP_NAME: getEnvWithDefault('VITE_APP_NAME', 'Oltu Municipality Platform'),
  MAPBOX_TOKEN: import.meta.env.VITE_MAPBOX_ACCESS_TOKEN,
  IS_DEV: import.meta.env.DEV,
  IS_PROD: import.meta.env.PROD,
};