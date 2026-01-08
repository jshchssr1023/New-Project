import { z } from 'zod';

// =============================================================================
// Common Validation Schemas
// Shared schemas used across multiple entity types
// =============================================================================

// UUID validation
export const UUIDSchema = z.string().uuid('Invalid UUID format');

// Pagination parameters
export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

// Date string validation (ISO format)
export const DateStringSchema = z.string().datetime({ message: 'Invalid date format. Use ISO 8601' });

// Optional date that can be null or undefined
export const OptionalDateSchema = z.string().datetime().nullable().optional();

// Month format YYYY-MM
export const MonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Invalid month format. Use YYYY-MM');

// Year validation
export const YearSchema = z.coerce.number().int().min(2000).max(2100);

// Month number 1-12
export const MonthNumberSchema = z.coerce.number().int().min(1).max(12);

// Priority levels
export const PrioritySchema = z.coerce.number().int().min(1).max(4).default(3);

// JSON array string validation helper
export const JsonArrayStringSchema = z.string().refine(
  (val) => {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed);
    } catch {
      return false;
    }
  },
  { message: 'Must be a valid JSON array string' }
);

// JSON object string validation helper
export const JsonObjectStringSchema = z.string().refine(
  (val) => {
    try {
      const parsed = JSON.parse(val);
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
    } catch {
      return false;
    }
  },
  { message: 'Must be a valid JSON object string' }
);

// Work type enum values
export const WorkTypeSchema = z.enum([
  'full_qualification',
  'partial_qualification',
  'assignment',
  'release',
  'repair',
]);

// Work types array (JSON stored)
export const WorkTypesArraySchema = z.array(WorkTypeSchema);

// Region enum
export const RegionSchema = z.enum([
  'Northeast',
  'Southeast',
  'Midwest',
  'Southwest',
  'West',
  '',
]).optional();

// Email validation with normalization
export const EmailSchema = z.string().email('Invalid email format').transform((val) => val.toLowerCase().trim());

// Non-empty string
export const NonEmptyStringSchema = z.string().min(1, 'Field cannot be empty');

// Optional non-empty string (empty becomes undefined)
export const OptionalStringSchema = z.string().optional().transform((val) => (val === '' ? undefined : val));

// Positive number
export const PositiveNumberSchema = z.coerce.number().positive('Must be a positive number');

// Non-negative number
export const NonNegativeNumberSchema = z.coerce.number().min(0, 'Must be a non-negative number');

// Percentage (0-100)
export const PercentageSchema = z.coerce.number().min(0).max(100);

// Cost validation
export const CostSchema = z.coerce.number().min(0).default(0);

// Boolean that accepts string "true"/"false" from query params
export const BooleanQuerySchema = z.preprocess(
  (val) => {
    if (typeof val === 'string') {
      return val === 'true';
    }
    return val;
  },
  z.boolean()
);

// ID array validation (for bulk operations)
export const IdArraySchema = z.array(UUIDSchema).min(1, 'At least one ID is required');

// Generic search query
export const SearchQuerySchema = z.object({
  q: z.string().optional(),
  ...PaginationSchema.shape,
});

// Batch operation result
export const BatchResultSchema = z.object({
  success: z.boolean(),
  processed: z.number(),
  failed: z.number(),
  errors: z.array(z.object({
    id: z.string(),
    message: z.string(),
  })).optional(),
});

// Export types
export type Pagination = z.infer<typeof PaginationSchema>;
export type WorkType = z.infer<typeof WorkTypeSchema>;
export type SearchQuery = z.infer<typeof SearchQuerySchema>;
export type BatchResult = z.infer<typeof BatchResultSchema>;
