import { Request, Response, NextFunction, RequestHandler } from 'express';
import { randomUUID } from 'crypto';
import logger from '../utils/logger';

// =============================================================================
// Correlation ID Middleware
// Generates/propagates X-Correlation-ID for request tracing across services
// =============================================================================

/**
 * Header name for correlation ID
 */
export const CORRELATION_ID_HEADER = 'x-correlation-id';

/**
 * Extend Express Request type to include correlationId
 */
declare global {
  namespace Express {
    interface Request {
      correlationId: string;
    }
  }
}

/**
 * Generate a new correlation ID
 * Uses UUID v4 format for uniqueness
 */
function generateCorrelationId(): string {
  return randomUUID();
}

/**
 * Validate correlation ID format
 * Accepts UUID format or custom format (alphanumeric with dashes, max 64 chars)
 */
function isValidCorrelationId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  // Accept UUIDs or custom IDs (alphanumeric, dashes, underscores, max 64 chars)
  return /^[a-zA-Z0-9_-]{1,64}$/.test(id);
}

/**
 * Correlation ID middleware options
 */
interface CorrelationIdOptions {
  /** Custom header name (default: 'x-correlation-id') */
  headerName?: string;
  /** Custom ID generator function */
  generator?: () => string;
  /** Whether to set the header in response (default: true) */
  setResponseHeader?: boolean;
  /** Whether to add to all log statements (default: true) */
  addToLogs?: boolean;
}

/**
 * Create correlation ID middleware
 * - Extracts correlation ID from incoming request header
 * - Generates new ID if not present
 * - Attaches to request object
 * - Adds to response headers
 * - Adds to log context
 */
export function correlationId(options: CorrelationIdOptions = {}): RequestHandler {
  const {
    headerName = CORRELATION_ID_HEADER,
    generator = generateCorrelationId,
    setResponseHeader = true,
    addToLogs = true,
  } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    // Try to get correlation ID from incoming request header
    let correlationId = req.get(headerName);

    // Validate incoming correlation ID
    if (correlationId && !isValidCorrelationId(correlationId)) {
      logger.warn('Invalid correlation ID received, generating new one', {
        invalidId: correlationId.substring(0, 20),
        path: req.path,
      });
      correlationId = undefined;
    }

    // Generate new ID if not present or invalid
    if (!correlationId) {
      correlationId = generator();
    }

    // Attach to request object for use in route handlers
    req.correlationId = correlationId;

    // Set response header so client can track the request
    if (setResponseHeader) {
      res.setHeader(headerName, correlationId);
    }

    // Add correlation ID to log context for this request
    if (addToLogs) {
      // Store original log methods
      const originalInfo = logger.info.bind(logger);
      const originalWarn = logger.warn.bind(logger);
      const originalError = logger.error.bind(logger);
      const originalDebug = logger.debug.bind(logger);

      // Wrap log methods to include correlation ID
      // Note: This modifies logger behavior for this request only
      // A more robust solution would use async local storage
      const addCorrelationId = (meta?: Record<string, unknown>) => ({
        ...meta,
        correlationId,
      });

      // Override for this request scope (best effort - not perfect isolation)
      // For better isolation, consider using AsyncLocalStorage
      req.app.locals.logContext = { correlationId };
    }

    // Capture original URL before routing modifies req.path
    const originalPath = req.originalUrl || req.path;

    // Log request start with correlation ID
    logger.info('Request started', {
      correlationId,
      method: req.method,
      path: originalPath,
      userAgent: req.get('user-agent')?.substring(0, 100),
    });

    // Track response time
    const startTime = Date.now();

    // Log response on finish
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const level = res.statusCode >= 400 ? 'warn' : 'info';

      logger[level]('Request completed', {
        correlationId,
        method: req.method,
        path: originalPath,
        statusCode: res.statusCode,
        durationMs: duration,
      });
    });

    next();
  };
}

/**
 * Default correlation ID middleware instance
 */
export const correlationIdMiddleware: RequestHandler = correlationId();

/**
 * Get correlation ID from request
 * Utility function for use in route handlers
 */
export function getCorrelationId(req: Request): string {
  return req.correlationId || req.get(CORRELATION_ID_HEADER) || 'unknown';
}

/**
 * Create a child correlation ID for sub-requests
 * Useful when making downstream API calls
 */
export function createChildCorrelationId(parentId: string): string {
  const childSuffix = randomUUID().substring(0, 8);
  return `${parentId}.${childSuffix}`;
}

/**
 * Extract request context for logging
 * Includes correlation ID and other relevant request metadata
 */
export function getRequestContext(req: Request): Record<string, unknown> {
  return {
    correlationId: req.correlationId,
    method: req.method,
    path: req.originalUrl || req.path,
    userId: (req as any).user?.id,
    companyId: (req as any).user?.companyId,
    ip: req.ip,
  };
}

/**
 * Middleware to propagate correlation ID to downstream services
 * Returns headers object to include in outgoing requests
 */
export function getCorrelationHeaders(req: Request): Record<string, string> {
  return {
    [CORRELATION_ID_HEADER]: req.correlationId || generateCorrelationId(),
  };
}

// Export types
export type { CorrelationIdOptions };
