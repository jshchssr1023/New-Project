import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import logger from './logger';

// =============================================================================
// Error Code Enum
// Defines all application error codes for consistent error handling
// =============================================================================

export enum ErrorCode {
  // Authentication & Authorization (1xxx)
  UNAUTHORIZED = 'AUTH_001',
  INVALID_CREDENTIALS = 'AUTH_002',
  TOKEN_EXPIRED = 'AUTH_003',
  TOKEN_INVALID = 'AUTH_004',
  INSUFFICIENT_PERMISSIONS = 'AUTH_005',
  SESSION_EXPIRED = 'AUTH_006',

  // Validation Errors (2xxx)
  VALIDATION_ERROR = 'VAL_001',
  INVALID_INPUT = 'VAL_002',
  MISSING_REQUIRED_FIELD = 'VAL_003',
  INVALID_FORMAT = 'VAL_004',
  INVALID_DATE_RANGE = 'VAL_005',
  INVALID_JSON = 'VAL_006',

  // Resource Errors (3xxx)
  NOT_FOUND = 'RES_001',
  ALREADY_EXISTS = 'RES_002',
  CONFLICT = 'RES_003',
  RESOURCE_LOCKED = 'RES_004',
  RESOURCE_ARCHIVED = 'RES_005',

  // Business Logic Errors (4xxx)
  CAPACITY_EXCEEDED = 'BUS_001',
  INVALID_STATUS_TRANSITION = 'BUS_002',
  CONSTRAINT_VIOLATION = 'BUS_003',
  OPERATION_NOT_ALLOWED = 'BUS_004',
  PREREQUISITE_NOT_MET = 'BUS_005',
  DUPLICATE_ASSIGNMENT = 'BUS_006',

  // External Service Errors (5xxx)
  EXTERNAL_SERVICE_ERROR = 'EXT_001',
  DATABASE_ERROR = 'EXT_002',
  NETWORK_ERROR = 'EXT_003',
  TIMEOUT = 'EXT_004',

  // System Errors (9xxx)
  INTERNAL_ERROR = 'SYS_001',
  NOT_IMPLEMENTED = 'SYS_002',
  SERVICE_UNAVAILABLE = 'SYS_003',
  RATE_LIMITED = 'SYS_004',
}

// =============================================================================
// HTTP Status Code Mapping
// =============================================================================

const errorCodeToStatusCode: Record<ErrorCode, number> = {
  // Authentication & Authorization
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.INVALID_CREDENTIALS]: 401,
  [ErrorCode.TOKEN_EXPIRED]: 401,
  [ErrorCode.TOKEN_INVALID]: 401,
  [ErrorCode.INSUFFICIENT_PERMISSIONS]: 403,
  [ErrorCode.SESSION_EXPIRED]: 401,

  // Validation
  [ErrorCode.VALIDATION_ERROR]: 400,
  [ErrorCode.INVALID_INPUT]: 400,
  [ErrorCode.MISSING_REQUIRED_FIELD]: 400,
  [ErrorCode.INVALID_FORMAT]: 400,
  [ErrorCode.INVALID_DATE_RANGE]: 400,
  [ErrorCode.INVALID_JSON]: 400,

  // Resource
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.ALREADY_EXISTS]: 409,
  [ErrorCode.CONFLICT]: 409,
  [ErrorCode.RESOURCE_LOCKED]: 423,
  [ErrorCode.RESOURCE_ARCHIVED]: 410,

  // Business Logic
  [ErrorCode.CAPACITY_EXCEEDED]: 422,
  [ErrorCode.INVALID_STATUS_TRANSITION]: 422,
  [ErrorCode.CONSTRAINT_VIOLATION]: 422,
  [ErrorCode.OPERATION_NOT_ALLOWED]: 403,
  [ErrorCode.PREREQUISITE_NOT_MET]: 428,
  [ErrorCode.DUPLICATE_ASSIGNMENT]: 409,

  // External Service
  [ErrorCode.EXTERNAL_SERVICE_ERROR]: 502,
  [ErrorCode.DATABASE_ERROR]: 503,
  [ErrorCode.NETWORK_ERROR]: 503,
  [ErrorCode.TIMEOUT]: 504,

  // System
  [ErrorCode.INTERNAL_ERROR]: 500,
  [ErrorCode.NOT_IMPLEMENTED]: 501,
  [ErrorCode.SERVICE_UNAVAILABLE]: 503,
  [ErrorCode.RATE_LIMITED]: 429,
};

// =============================================================================
// AppError Class
// Custom error class with code, message, and HTTP status code
// =============================================================================

export interface ErrorDetails {
  field?: string;
  message?: string;
  value?: unknown;
  constraint?: string;
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: ErrorDetails[];
  public readonly correlationId?: string;
  public readonly timestamp: string;

  constructor(
    code: ErrorCode,
    message: string,
    options?: {
      details?: ErrorDetails[];
      correlationId?: string;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = errorCodeToStatusCode[code] || 500;
    this.isOperational = true;
    this.details = options?.details;
    this.correlationId = options?.correlationId;
    this.timestamp = new Date().toISOString();

    // Maintain proper stack trace
    Error.captureStackTrace(this, this.constructor);

    // Set the cause if provided
    if (options?.cause) {
      this.cause = options.cause;
    }
  }

  /**
   * Create a formatted error response object
   */
  toJSON(): Record<string, unknown> {
    return {
      error: {
        code: this.code,
        message: this.message,
        statusCode: this.statusCode,
        ...(this.details && { details: this.details }),
        ...(this.correlationId && { correlationId: this.correlationId }),
        timestamp: this.timestamp,
      },
    };
  }
}

// =============================================================================
// Error Factory Functions
// Convenience functions to create common error types
// =============================================================================

export const Errors = {
  // Authentication
  unauthorized: (message = 'Authentication required') =>
    new AppError(ErrorCode.UNAUTHORIZED, message),

  invalidCredentials: (message = 'Invalid email or password') =>
    new AppError(ErrorCode.INVALID_CREDENTIALS, message),

  tokenExpired: (message = 'Session has expired, please log in again') =>
    new AppError(ErrorCode.TOKEN_EXPIRED, message),

  tokenInvalid: (message = 'Invalid or malformed token') =>
    new AppError(ErrorCode.TOKEN_INVALID, message),

  forbidden: (message = 'You do not have permission to perform this action') =>
    new AppError(ErrorCode.INSUFFICIENT_PERMISSIONS, message),

  // Validation
  validation: (message: string, details?: ErrorDetails[]) =>
    new AppError(ErrorCode.VALIDATION_ERROR, message, { details }),

  invalidInput: (field: string, message: string, value?: unknown) =>
    new AppError(ErrorCode.INVALID_INPUT, `Invalid input for ${field}: ${message}`, {
      details: [{ field, message, value }],
    }),

  missingField: (field: string) =>
    new AppError(ErrorCode.MISSING_REQUIRED_FIELD, `Missing required field: ${field}`, {
      details: [{ field, message: 'This field is required' }],
    }),

  invalidFormat: (field: string, expectedFormat: string) =>
    new AppError(ErrorCode.INVALID_FORMAT, `Invalid format for ${field}. Expected: ${expectedFormat}`, {
      details: [{ field, message: `Expected format: ${expectedFormat}` }],
    }),

  invalidDateRange: (message = 'Start date must be before end date') =>
    new AppError(ErrorCode.INVALID_DATE_RANGE, message),

  invalidJson: (field: string) =>
    new AppError(ErrorCode.INVALID_JSON, `Invalid JSON in field: ${field}`, {
      details: [{ field, message: 'Must be valid JSON' }],
    }),

  // Resource
  notFound: (resource: string, id?: string) =>
    new AppError(
      ErrorCode.NOT_FOUND,
      id ? `${resource} with ID '${id}' not found` : `${resource} not found`
    ),

  alreadyExists: (resource: string, field: string, value: string) =>
    new AppError(ErrorCode.ALREADY_EXISTS, `${resource} with ${field} '${value}' already exists`, {
      details: [{ field, value, message: 'Already exists' }],
    }),

  conflict: (message: string, details?: ErrorDetails[]) =>
    new AppError(ErrorCode.CONFLICT, message, { details }),

  resourceLocked: (resource: string, reason?: string) =>
    new AppError(
      ErrorCode.RESOURCE_LOCKED,
      `${resource} is locked${reason ? `: ${reason}` : ''}`
    ),

  resourceArchived: (resource: string) =>
    new AppError(ErrorCode.RESOURCE_ARCHIVED, `${resource} has been archived`),

  // Business Logic
  capacityExceeded: (shop: string, month: string, available: number, requested: number) =>
    new AppError(
      ErrorCode.CAPACITY_EXCEEDED,
      `Capacity exceeded for ${shop} in ${month}. Available: ${available}, Requested: ${requested}`,
      {
        details: [
          { field: 'shop', value: shop },
          { field: 'month', value: month },
          { field: 'available', value: available },
          { field: 'requested', value: requested },
        ],
      }
    ),

  invalidStatusTransition: (from: string, to: string, resource: string) =>
    new AppError(
      ErrorCode.INVALID_STATUS_TRANSITION,
      `Cannot transition ${resource} from '${from}' to '${to}'`
    ),

  constraintViolation: (message: string, constraint?: string) =>
    new AppError(ErrorCode.CONSTRAINT_VIOLATION, message, {
      details: constraint ? [{ constraint, message }] : undefined,
    }),

  operationNotAllowed: (message: string) =>
    new AppError(ErrorCode.OPERATION_NOT_ALLOWED, message),

  prerequisiteNotMet: (message: string) =>
    new AppError(ErrorCode.PREREQUISITE_NOT_MET, message),

  duplicateAssignment: (carId: string, shopId: string, month: string) =>
    new AppError(
      ErrorCode.DUPLICATE_ASSIGNMENT,
      `Car is already assigned to a shop for ${month}`,
      {
        details: [
          { field: 'carId', value: carId },
          { field: 'shopId', value: shopId },
          { field: 'month', value: month },
        ],
      }
    ),

  // System
  internal: (message = 'An unexpected error occurred') =>
    new AppError(ErrorCode.INTERNAL_ERROR, message),

  notImplemented: (feature: string) =>
    new AppError(ErrorCode.NOT_IMPLEMENTED, `${feature} is not yet implemented`),

  serviceUnavailable: (service: string) =>
    new AppError(ErrorCode.SERVICE_UNAVAILABLE, `${service} is currently unavailable`),

  rateLimited: (retryAfter?: number) =>
    new AppError(
      ErrorCode.RATE_LIMITED,
      `Too many requests. ${retryAfter ? `Please retry after ${retryAfter} seconds.` : 'Please try again later.'}`
    ),

  database: (message = 'Database operation failed') =>
    new AppError(ErrorCode.DATABASE_ERROR, message),

  timeout: (operation: string) =>
    new AppError(ErrorCode.TIMEOUT, `Operation timed out: ${operation}`),
};

// =============================================================================
// Error Handler Middleware
// Formats all errors consistently for API responses
// =============================================================================

export const errorHandler: ErrorRequestHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Get correlation ID from request if available
  const correlationId = (req as any).correlationId || req.headers['x-correlation-id'];

  // Handle AppError (operational errors)
  if (err instanceof AppError) {
    logger.warn('Operational error', {
      code: err.code,
      message: err.message,
      statusCode: err.statusCode,
      correlationId,
      path: req.path,
      method: req.method,
    });

    res.status(err.statusCode).json({
      ...err.toJSON(),
      ...(correlationId && { correlationId }),
    });
    return;
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const details = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));

    logger.warn('Validation error', {
      errors: details,
      correlationId,
      path: req.path,
      method: req.method,
    });

    res.status(400).json({
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Validation failed',
        statusCode: 400,
        details,
        ...(correlationId && { correlationId }),
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  // Handle Prisma errors
  if (err.name === 'PrismaClientKnownRequestError') {
    const prismaError = err as any;
    let message = 'Database operation failed';
    let code = ErrorCode.DATABASE_ERROR;
    let statusCode = 500;

    // Handle specific Prisma error codes
    if (prismaError.code === 'P2002') {
      // Unique constraint violation
      code = ErrorCode.ALREADY_EXISTS;
      statusCode = 409;
      const target = prismaError.meta?.target;
      message = target
        ? `A record with this ${Array.isArray(target) ? target.join(', ') : target} already exists`
        : 'A record with these values already exists';
    } else if (prismaError.code === 'P2025') {
      // Record not found
      code = ErrorCode.NOT_FOUND;
      statusCode = 404;
      message = 'Record not found';
    } else if (prismaError.code === 'P2003') {
      // Foreign key constraint violation
      code = ErrorCode.CONSTRAINT_VIOLATION;
      statusCode = 422;
      message = 'Cannot delete or update due to related records';
    }

    logger.error('Database error', {
      code: prismaError.code,
      message,
      correlationId,
      path: req.path,
      method: req.method,
    });

    res.status(statusCode).json({
      error: {
        code,
        message,
        statusCode,
        ...(correlationId && { correlationId }),
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  // Handle unknown errors (programming errors)
  logger.error('Unhandled error', {
    name: err.name,
    message: err.message,
    stack: err.stack,
    correlationId,
    path: req.path,
    method: req.method,
  });

  // Don't leak error details in production
  const isProduction = process.env.NODE_ENV === 'production';
  res.status(500).json({
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: isProduction ? 'An unexpected error occurred' : err.message,
      statusCode: 500,
      ...(correlationId && { correlationId }),
      timestamp: new Date().toISOString(),
      ...(!isProduction && { stack: err.stack }),
    },
  });
};

// =============================================================================
// Async Handler Wrapper
// Wraps async route handlers to catch errors automatically
// =============================================================================

type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void>;

export function asyncHandler(fn: AsyncRequestHandler): AsyncRequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await fn(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

// =============================================================================
// Not Found Handler
// Middleware for handling 404 errors
// =============================================================================

export const notFoundHandler = (req: Request, res: Response): void => {
  const correlationId = (req as any).correlationId || req.headers['x-correlation-id'];

  res.status(404).json({
    error: {
      code: ErrorCode.NOT_FOUND,
      message: `Cannot ${req.method} ${req.path}`,
      statusCode: 404,
      ...(correlationId && { correlationId }),
      timestamp: new Date().toISOString(),
    },
  });
};
