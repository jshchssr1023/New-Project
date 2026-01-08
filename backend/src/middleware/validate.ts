import { Request, Response, NextFunction, RequestHandler } from 'express';
import { z, ZodError, ZodSchema } from 'zod';
import logger from '../utils/logger';

// =============================================================================
// Validation Middleware
// Centralized request validation using Zod schemas
// =============================================================================

/**
 * Validation source - where to look for data to validate
 */
type ValidationSource = 'body' | 'query' | 'params';

/**
 * Validation error response format
 */
interface ValidationErrorResponse {
  message: string;
  code: string;
  errors: Array<{
    field: string;
    message: string;
    code: string;
  }>;
}

/**
 * Format Zod errors into a consistent response structure
 */
function formatZodError(error: ZodError): ValidationErrorResponse {
  const formattedErrors = error.errors.map((err) => ({
    field: err.path.join('.'),
    message: err.message,
    code: err.code,
  }));

  return {
    message: 'Validation failed',
    code: 'VALIDATION_ERROR',
    errors: formattedErrors,
  };
}

/**
 * Create a validation middleware for request body
 * @param schema - Zod schema to validate against
 * @returns Express middleware function
 */
export function validateBody<T extends ZodSchema>(schema: T): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validatedData = await schema.parseAsync(req.body);
      req.body = validatedData;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorResponse = formatZodError(error);
        logger.warn('Request body validation failed', {
          path: req.path,
          method: req.method,
          errors: errorResponse.errors,
        });
        res.status(400).json(errorResponse);
        return;
      }
      next(error);
    }
  };
}

/**
 * Create a validation middleware for query parameters
 * @param schema - Zod schema to validate against
 * @returns Express middleware function
 */
export function validateQuery<T extends ZodSchema>(schema: T): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validatedData = await schema.parseAsync(req.query);
      req.query = validatedData;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorResponse = formatZodError(error);
        logger.warn('Request query validation failed', {
          path: req.path,
          method: req.method,
          errors: errorResponse.errors,
        });
        res.status(400).json(errorResponse);
        return;
      }
      next(error);
    }
  };
}

/**
 * Create a validation middleware for route parameters
 * @param schema - Zod schema to validate against
 * @returns Express middleware function
 */
export function validateParams<T extends ZodSchema>(schema: T): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validatedData = await schema.parseAsync(req.params);
      req.params = validatedData;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorResponse = formatZodError(error);
        logger.warn('Request params validation failed', {
          path: req.path,
          method: req.method,
          errors: errorResponse.errors,
        });
        res.status(400).json(errorResponse);
        return;
      }
      next(error);
    }
  };
}

/**
 * Create a validation middleware that validates multiple sources
 * @param schemas - Object containing schemas for body, query, and/or params
 * @returns Express middleware function
 */
export function validate(schemas: {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const allErrors: Array<{ source: ValidationSource; errors: ValidationErrorResponse['errors'] }> = [];

    // Validate body
    if (schemas.body) {
      try {
        req.body = await schemas.body.parseAsync(req.body);
      } catch (error) {
        if (error instanceof ZodError) {
          allErrors.push({
            source: 'body',
            errors: formatZodError(error).errors,
          });
        } else {
          return next(error);
        }
      }
    }

    // Validate query
    if (schemas.query) {
      try {
        req.query = await schemas.query.parseAsync(req.query);
      } catch (error) {
        if (error instanceof ZodError) {
          allErrors.push({
            source: 'query',
            errors: formatZodError(error).errors,
          });
        } else {
          return next(error);
        }
      }
    }

    // Validate params
    if (schemas.params) {
      try {
        req.params = await schemas.params.parseAsync(req.params);
      } catch (error) {
        if (error instanceof ZodError) {
          allErrors.push({
            source: 'params',
            errors: formatZodError(error).errors,
          });
        } else {
          return next(error);
        }
      }
    }

    if (allErrors.length > 0) {
      const combinedErrors = allErrors.flatMap(({ source, errors }) =>
        errors.map((e) => ({
          ...e,
          field: source === 'body' ? e.field : `${source}.${e.field}`,
        }))
      );

      logger.warn('Request validation failed', {
        path: req.path,
        method: req.method,
        errors: combinedErrors,
      });

      res.status(400).json({
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        errors: combinedErrors,
      });
      return;
    }

    next();
  };
}

/**
 * Helper to create a params schema for common ID validation
 */
export const IdParamSchema = z.object({
  id: z.string().uuid('Invalid ID format'),
});

/**
 * Middleware to validate :id param as UUID
 */
export const validateIdParam = validateParams(IdParamSchema);

/**
 * Parse and validate JSON array string fields
 * Returns the parsed array or throws validation error
 */
export function parseJsonArrayField<T>(
  value: string | null | undefined,
  itemSchema: ZodSchema<T>,
  fieldName: string
): T[] {
  if (!value || value === '[]') {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      throw new Error(`${fieldName} must be a JSON array`);
    }
    return z.array(itemSchema).parse(parsed);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`${fieldName} contains invalid JSON`);
    }
    if (error instanceof ZodError) {
      const messages = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
      throw new Error(`${fieldName} validation failed: ${messages.join(', ')}`);
    }
    throw error;
  }
}

/**
 * Parse and validate JSON object string fields
 * Returns the parsed object or throws validation error
 */
export function parseJsonObjectField<T>(
  value: string | null | undefined,
  schema: ZodSchema<T>,
  fieldName: string
): T {
  if (!value || value === '{}') {
    return schema.parse({});
  }

  try {
    const parsed = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error(`${fieldName} must be a JSON object`);
    }
    return schema.parse(parsed);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`${fieldName} contains invalid JSON`);
    }
    if (error instanceof ZodError) {
      const messages = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
      throw new Error(`${fieldName} validation failed: ${messages.join(', ')}`);
    }
    throw error;
  }
}

// Export types
export type { ValidationErrorResponse };
