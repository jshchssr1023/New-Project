/**
 * Logger Utility
 *
 * Centralized logging with configurable log levels.
 * Replaces console.log statements throughout the codebase.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatMessage(level: LogLevel, message: string, meta?: Record<string, unknown>): string {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
}

export const logger = {
  debug(message: string, meta?: Record<string, unknown>): void {
    if (shouldLog('debug')) {
      console.debug(formatMessage('debug', message, meta));
    }
  },

  info(message: string, meta?: Record<string, unknown>): void {
    if (shouldLog('info')) {
      console.info(formatMessage('info', message, meta));
    }
  },

  warn(message: string, meta?: Record<string, unknown>): void {
    if (shouldLog('warn')) {
      console.warn(formatMessage('warn', message, meta));
    }
  },

  error(message: string, error?: Error | unknown, meta?: Record<string, unknown>): void {
    if (shouldLog('error')) {
      const errorMeta = error instanceof Error
        ? { ...meta, errorMessage: error.message, stack: error.stack }
        : { ...meta, error };
      console.error(formatMessage('error', message, errorMeta));
    }
  },
};

export default logger;

/**
 * Safe JSON parse utility
 * Parses JSON with fallback value and error logging
 */
export function safeJsonParse<T>(
  jsonString: string | null | undefined,
  defaultValue: T,
  context?: string
): T {
  if (!jsonString) {
    return defaultValue;
  }
  try {
    return JSON.parse(jsonString) as T;
  } catch (error) {
    logger.error(`Failed to parse JSON${context ? ` in ${context}` : ''}`, error as Error, {
      jsonPreview: jsonString.substring(0, 100),
    });
    return defaultValue;
  }
}
