/**
 * Route Parameter Utilities
 *
 * Express 5 (@types/express 5) types route params as `string | string[]`
 * to handle cases where the same route param name can match multiple times.
 * This helper safely extracts a single string value.
 */

/**
 * Extract a string param from Express route params
 * Handles the case where param might be an array (Express 5 typing)
 */
export function getParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] || '';
  return param || '';
}

export default { getParam };
