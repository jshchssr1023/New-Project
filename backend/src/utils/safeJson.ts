/**
 * Safe JSON Parsing Utility
 *
 * Provides safe JSON parsing with default values to prevent crashes
 * from malformed JSON stored in the database or received from external sources.
 */

import logger from './logger';

/**
 * Safely parse a JSON string with a default value fallback
 * @param jsonString - The JSON string to parse
 * @param defaultValue - The default value to return if parsing fails
 * @param context - Optional context for logging
 * @returns The parsed value or the default value
 */
export function safeJsonParse<T>(
  jsonString: string | null | undefined,
  defaultValue: T,
  context?: string
): T {
  if (jsonString === null || jsonString === undefined || jsonString === '') {
    return defaultValue;
  }

  try {
    return JSON.parse(jsonString) as T;
  } catch (error) {
    logger.warn('Failed to parse JSON', {
      context: context || 'unknown',
      preview: jsonString.substring(0, 100),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return defaultValue;
  }
}

/**
 * Safely parse a JSON string expecting an array
 * @param jsonString - The JSON string to parse
 * @param context - Optional context for logging
 * @returns The parsed array or an empty array
 */
export function safeJsonParseArray<T>(
  jsonString: string | null | undefined,
  context?: string
): T[] {
  const result = safeJsonParse<T[]>(jsonString, [], context);
  return Array.isArray(result) ? result : [];
}

/**
 * Safely parse a JSON string expecting an object
 * @param jsonString - The JSON string to parse
 * @param context - Optional context for logging
 * @returns The parsed object or an empty object
 */
export function safeJsonParseObject<T extends Record<string, unknown>>(
  jsonString: string | null | undefined,
  context?: string
): T {
  const result = safeJsonParse<T>(jsonString, {} as T, context);
  return typeof result === 'object' && result !== null && !Array.isArray(result)
    ? result
    : ({} as T);
}

export default {
  parse: safeJsonParse,
  parseArray: safeJsonParseArray,
  parseObject: safeJsonParseObject,
};
