/**
 * Development-only logger utility
 * All logs are disabled in production builds
 */
const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development'

export const devLog = {
  log: (...args: any[]) => {
    if (isDevelopment) {
      console.log(...args)
    }
  },
  warn: (...args: any[]) => {
    if (isDevelopment) {
      console.warn(...args)
    }
  },
  error: (...args: any[]) => {
    // Always log errors, even in production
    console.error(...args)
  }
}

