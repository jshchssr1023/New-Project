/**
 * Authentication Middleware Tests
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authenticate, generateToken, AuthRequest, AuthUser } from '../../middleware/auth';

// Mock prisma
jest.mock('../../services/db', () => ({
  prisma: {
    invalidatedToken: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
  },
}));

describe('Auth Middleware', () => {
  let mockRequest: Partial<AuthRequest>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;

  beforeEach(() => {
    mockRequest = {
      headers: {},
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    nextFunction = jest.fn();
  });

  describe('authenticate', () => {
    it('should reject requests without authorization header', async () => {
      await authenticate(
        mockRequest as AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'No token provided',
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should reject requests with invalid Bearer format', async () => {
      mockRequest.headers = { authorization: 'Invalid token' };

      await authenticate(
        mockRequest as AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'No token provided',
      });
    });

    it('should reject requests with invalid token', async () => {
      mockRequest.headers = { authorization: 'Bearer invalid-token' };

      await authenticate(
        mockRequest as AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Invalid token',
      });
    });

    it('should accept requests with valid token', async () => {
      const user: AuthUser = {
        id: 'test-id',
        email: 'test@example.com',
        role: 'admin',
        companyId: 'test-company',
      };
      const token = generateToken(user);
      mockRequest.headers = { authorization: `Bearer ${token}` };

      await authenticate(
        mockRequest as AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalled();
      expect((mockRequest as AuthRequest).user).toEqual(user);
    });
  });

  describe('generateToken', () => {
    it('should generate a valid JWT token', () => {
      const user: AuthUser = {
        id: 'test-id',
        email: 'test@example.com',
        role: 'admin',
        companyId: 'test-company',
      };

      const token = generateToken(user);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');

      // Verify the token can be decoded
      const decoded = jwt.decode(token) as AuthUser & { iat: number; exp: number };
      expect(decoded.id).toBe(user.id);
      expect(decoded.email).toBe(user.email);
      expect(decoded.role).toBe(user.role);
      expect(decoded.companyId).toBe(user.companyId);
    });

    it('should include expiration in the token', () => {
      const user: AuthUser = {
        id: 'test-id',
        email: 'test@example.com',
        role: 'viewer',
        companyId: 'test-company',
      };

      const token = generateToken(user);
      const decoded = jwt.decode(token) as { exp: number };

      expect(decoded.exp).toBeDefined();
      // Token should expire in the future (24 hours from now)
      expect(decoded.exp * 1000).toBeGreaterThan(Date.now());
    });
  });
});
