import { z } from 'zod';
import { UUIDSchema, EmailSchema } from './common';

// =============================================================================
// User Role Schema
// =============================================================================

export const UserRoleSchema = z.enum(['admin', 'planner', 'viewer', 'approver', 'finance']);

// =============================================================================
// Password Validation
// =============================================================================

// Password validation schema - min 8 chars, 1 uppercase, 1 number, 1 special char
export const PasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Password must contain at least one special character');

// =============================================================================
// User Validation Schemas
// =============================================================================

// Create user schema (registration)
export const CreateUserSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  role: UserRoleSchema.default('viewer'),
  companyId: UUIDSchema,
});

// Update user schema (profile update)
export const UpdateUserSchema = z.object({
  email: EmailSchema.optional(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  role: UserRoleSchema.optional(),
});

// Change password schema
export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: PasswordSchema,
  confirmPassword: z.string().min(1, 'Password confirmation is required'),
}).refine(
  (data) => data.newPassword === data.confirmPassword,
  { message: 'Passwords do not match', path: ['confirmPassword'] }
).refine(
  (data) => data.currentPassword !== data.newPassword,
  { message: 'New password must be different from current password', path: ['newPassword'] }
);

// Login schema
export const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, 'Password is required'),
});

// Reset password request schema
export const ResetPasswordRequestSchema = z.object({
  email: EmailSchema,
});

// Reset password confirmation schema
export const ResetPasswordConfirmSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: PasswordSchema,
  confirmPassword: z.string().min(1, 'Password confirmation is required'),
}).refine(
  (data) => data.newPassword === data.confirmPassword,
  { message: 'Passwords do not match', path: ['confirmPassword'] }
);

// User query schema
export const UserQuerySchema = z.object({
  role: UserRoleSchema.optional(),
  search: z.string().optional(),
  isActive: z.preprocess((val) => val === 'true', z.boolean()).optional(),
});

// Bulk update users role schema
export const BulkUpdateUserRoleSchema = z.object({
  userIds: z.array(UUIDSchema).min(1, 'At least one user ID is required'),
  role: UserRoleSchema,
});

// Export types
export type CreateUser = z.infer<typeof CreateUserSchema>;
export type UpdateUser = z.infer<typeof UpdateUserSchema>;
export type ChangePassword = z.infer<typeof ChangePasswordSchema>;
export type Login = z.infer<typeof LoginSchema>;
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;
export type ResetPasswordConfirm = z.infer<typeof ResetPasswordConfirmSchema>;
export type UserQuery = z.infer<typeof UserQuerySchema>;
export type UserRole = z.infer<typeof UserRoleSchema>;
