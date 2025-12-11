/**
 * Shopping Status Service Tests
 *
 * Tests for the Shopping Status Engine decision tree algorithm.
 */

import {
  calculateShoppingStatus,
  ShoppingStatus,
  CarForStatusCalculation,
} from '../../services/shoppingStatusService';

describe('Shopping Status Service', () => {
  const baseDate = new Date('2025-06-15');
  const currentYear = baseDate.getFullYear();

  // Helper to create a car with default values
  const createCar = (overrides: Partial<CarForStatusCalculation> = {}): CarForStatusCalculation => ({
    id: 'test-car-1',
    status: 'In Service',
    isTankCar: true,
    safetyRelief: null,
    serviceEquipment: null,
    tankQualification: null,
    ...overrides,
  });

  describe('calculateShoppingStatus', () => {
    describe('Step 1: Car in shop', () => {
      it('should return "In Shop" when status is "Arrived"', () => {
        const car = createCar({ status: 'Arrived' });
        const result = calculateShoppingStatus(car, false);
        expect(result.status).toBe('In Shop');
        expect(result.earliestQualDue).toBeNull();
      });
    });

    describe('Step 2: Already planned', () => {
      it('should return "Planned" when car has a Car Flow Plan', () => {
        const car = createCar({ status: 'In Service' });
        const result = calculateShoppingStatus(car, true);
        expect(result.status).toBe('Planned');
        expect(result.earliestQualDue).toBeNull();
      });
    });

    describe('Step 3: Non-tank cars', () => {
      it('should return "Compliant" for non-tank cars with no qualifications', () => {
        const car = createCar({ isTankCar: false });
        const result = calculateShoppingStatus(car, false);
        expect(result.status).toBe('Compliant');
      });
    });

    describe('Step 4: No qualification dates', () => {
      it('should return "Unknown" when tank car has no qualification dates', () => {
        const car = createCar({
          isTankCar: true,
          safetyRelief: null,
          serviceEquipment: null,
          tankQualification: null,
        });
        const result = calculateShoppingStatus(car, false);
        expect(result.status).toBe('Unknown');
      });
    });

    describe('Step 5: Prior year qualifications (Urgent)', () => {
      it('should return "Urgent" when any qualification is expired (prior year)', () => {
        const car = createCar({
          isTankCar: true,
          safetyRelief: new Date('2024-03-15'), // Prior year
          serviceEquipment: new Date('2026-06-15'),
          tankQualification: new Date('2026-06-15'),
        });
        const result = calculateShoppingStatus(car, false);
        expect(result.status).toBe('Urgent');
        expect(result.qualificationType).toBe('safetyRelief');
      });

      it('should return the earliest expiring qualification', () => {
        const car = createCar({
          isTankCar: true,
          safetyRelief: new Date('2024-01-15'),
          serviceEquipment: new Date('2024-06-15'),
          tankQualification: new Date('2024-03-15'),
        });
        const result = calculateShoppingStatus(car, false);
        expect(result.status).toBe('Urgent');
        expect(result.qualificationType).toBe('safetyRelief');
      });
    });

    describe('Step 6: Current year qualifications (Must Shop)', () => {
      it('should return "Must Shop" when any qualification expires current year', () => {
        const car = createCar({
          isTankCar: true,
          safetyRelief: new Date('2025-09-15'), // Current year
          serviceEquipment: new Date('2027-06-15'),
          tankQualification: new Date('2027-06-15'),
        });
        const result = calculateShoppingStatus(car, false);
        expect(result.status).toBe('Must Shop');
        expect(result.qualificationType).toBe('safetyRelief');
      });
    });

    describe('Step 7: Next year qualifications (Upcoming)', () => {
      it('should return "Upcoming" when earliest qualification expires next year', () => {
        const car = createCar({
          isTankCar: true,
          safetyRelief: new Date('2026-03-15'), // Next year
          serviceEquipment: new Date('2027-06-15'),
          tankQualification: new Date('2027-06-15'),
        });
        const result = calculateShoppingStatus(car, false);
        expect(result.status).toBe('Upcoming');
        expect(result.qualificationType).toBe('safetyRelief');
      });
    });

    describe('Step 8: Compliant (2+ years)', () => {
      it('should return "Compliant" when all qualifications are 2+ years away', () => {
        const car = createCar({
          isTankCar: true,
          safetyRelief: new Date('2027-06-15'), // 2+ years
          serviceEquipment: new Date('2028-06-15'),
          tankQualification: new Date('2029-06-15'),
        });
        const result = calculateShoppingStatus(car, false);
        expect(result.status).toBe('Compliant');
      });
    });

    describe('Edge cases', () => {
      it('should handle partial qualification dates', () => {
        const car = createCar({
          isTankCar: true,
          safetyRelief: new Date('2025-06-15'),
          serviceEquipment: null,
          tankQualification: null,
        });
        const result = calculateShoppingStatus(car, false);
        expect(result.status).toBe('Must Shop');
      });

      it('should handle string dates', () => {
        const car = createCar({
          isTankCar: true,
          safetyRelief: '2024-06-15' as unknown as Date,
          serviceEquipment: new Date('2026-06-15'),
          tankQualification: new Date('2026-06-15'),
        });
        const result = calculateShoppingStatus(car, false);
        expect(result.status).toBe('Urgent');
      });

      it('should handle all statuses that mean "in shop"', () => {
        const inShopStatuses = ['Arrived'];
        for (const status of inShopStatuses) {
          const car = createCar({ status });
          const result = calculateShoppingStatus(car, false);
          expect(result.status).toBe('In Shop');
        }
      });
    });
  });
});
