/**
 * Jest Test Setup
 *
 * This file runs before each test file and sets up the testing environment.
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
process.env.DATABASE_URL = 'file:./test.db';

// Increase timeout for async operations
jest.setTimeout(30000);

// Global test utilities
beforeAll(async () => {
  // Add any global setup here
  console.log('Starting test suite...');
});

afterAll(async () => {
  // Add any global cleanup here
  console.log('Test suite completed.');
});

// Reset mocks between tests
afterEach(() => {
  jest.clearAllMocks();
});

// Export utilities for tests
export const testUtils = {
  /**
   * Create a mock authenticated user
   */
  createMockUser: (overrides = {}) => ({
    id: 'test-user-id',
    email: 'test@example.com',
    role: 'admin',
    companyId: 'test-company-id',
    ...overrides,
  }),

  /**
   * Create a mock car object
   */
  createMockCar: (overrides = {}) => ({
    id: 'test-car-id',
    railcarNumber: 'TEST1234',
    carType: 'Tank',
    isTankCar: true,
    commodity: 'Chemicals',
    customer: 'Test Customer',
    status: 'available',
    companyId: 'test-company-id',
    ...overrides,
  }),

  /**
   * Create a mock shop object
   */
  createMockShop: (overrides = {}) => ({
    id: 'test-shop-id',
    name: 'Test Shop',
    code: 'TSHP',
    location: 'Test Location',
    region: 'Midwest',
    capacity: 50,
    tankQualified: true,
    isActive: true,
    companyId: 'test-company-id',
    ...overrides,
  }),
};
