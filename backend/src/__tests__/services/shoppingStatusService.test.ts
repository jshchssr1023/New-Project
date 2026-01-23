/**
 * Shopping Status Service Tests
 *
 * Tests for the Shopping Status Engine decision tree algorithm.
 */

import {
  calculateShoppingStatus,
  CarForStatusCalculation,
} from '../../services/shoppingStatusService';

describe('Shopping Status Service', () => {
  // Helper to create a car with default values matching the actual interface
  const createCar = (overrides: Partial<CarForStatusCalculation> = {}): CarForStatusCalculation => ({
    id: 'test-car-1',
    status: 'ToBeRouted',
    portfolio: false,
    performedTankQual: false,
    minNoLining: null,
    minWLining: null,
    interiorLining: null,
    rule88B: null,
    safetyRelief: null,
    serviceEquipment: null,
    stubSill: null,
    tankThickness: null,
    tankQualification: null,
    ...overrides,
  });

  describe('calculateShoppingStatus', () => {
    describe('Step 1: Car in shop (Arrived status)', () => {
      it('should return "InShop" when status is "Arrived"', () => {
        const car = createCar({ status: 'Arrived' });
        const result = calculateShoppingStatus(car, false);
        expect(result.status).toBe('InShop');
        expect(result.earliestQualDue).toBeNull();
      });
    });

    describe('Step 2: Complete with portfolio', () => {
      it('should return "Compliant" when status is "Complete" and portfolio is true', () => {
        const car = createCar({ status: 'Complete', portfolio: true });
        const result = calculateShoppingStatus(car, false);
        expect(result.status).toBe('Compliant');
      });

      it('should NOT return "Compliant" when status is "Complete" but portfolio is false', () => {
        const car = createCar({ status: 'Complete', portfolio: false });
        const result = calculateShoppingStatus(car, false);
        expect(result.status).not.toBe('Compliant');
      });
    });

    describe('Step 3: Already planned', () => {
      it('should return "Planned" when car has a Car Flow Plan', () => {
        const car = createCar({ status: 'ToBeRouted' });
        const result = calculateShoppingStatus(car, true);
        expect(result.status).toBe('Planned');
        expect(result.earliestQualDue).toBeNull();
      });
    });

    describe('Step 4: Qualification date evaluation', () => {
      const currentYear = new Date().getFullYear();

      it('should return "Urgent" when qualification is from prior year', () => {
        const car = createCar({
          status: 'ToBeRouted',
          safetyRelief: new Date(currentYear - 1, 2, 15), // Prior year
        });
        const result = calculateShoppingStatus(car, false);
        expect(result.status).toBe('Urgent');
        expect(result.qualificationType).toBe('safetyRelief');
      });

      it('should return "MustShop" when qualification expires current year', () => {
        const car = createCar({
          status: 'ToBeRouted',
          safetyRelief: new Date(currentYear, 8, 15), // Current year September
        });
        const result = calculateShoppingStatus(car, false);
        expect(result.status).toBe('MustShop');
        expect(result.qualificationType).toBe('safetyRelief');
      });

      it('should return "Upcoming" when qualification expires next year', () => {
        const car = createCar({
          status: 'ToBeRouted',
          safetyRelief: new Date(currentYear + 1, 2, 15), // Next year
        });
        const result = calculateShoppingStatus(car, false);
        expect(result.status).toBe('Upcoming');
        expect(result.qualificationType).toBe('safetyRelief');
      });

      it('should return "Compliant" when all qualifications are 2+ years away', () => {
        const car = createCar({
          status: 'ToBeRouted',
          safetyRelief: new Date(currentYear + 2, 5, 15), // 2+ years
          serviceEquipment: new Date(currentYear + 3, 5, 15),
          tankQualification: new Date(currentYear + 4, 5, 15),
        });
        const result = calculateShoppingStatus(car, false);
        expect(result.status).toBe('Compliant');
      });

      it('should use earliest expiring qualification date', () => {
        const car = createCar({
          status: 'ToBeRouted',
          safetyRelief: new Date(currentYear - 1, 0, 15), // Earliest - prior year
          serviceEquipment: new Date(currentYear + 1, 5, 15),
          tankQualification: new Date(currentYear + 2, 5, 15),
        });
        const result = calculateShoppingStatus(car, false);
        expect(result.status).toBe('Urgent');
        expect(result.qualificationType).toBe('safetyRelief');
      });
    });

    describe('Step 5: Portfolio with tank qualification', () => {
      it('should return "MustShop" when portfolio is true and performedTankQual is true', () => {
        const car = createCar({
          status: 'InService', // Not in qualification eval statuses
          portfolio: true,
          performedTankQual: true,
        });
        const result = calculateShoppingStatus(car, false);
        expect(result.status).toBe('MustShop');
      });
    });

    describe('Step 6: Unknown (default)', () => {
      it('should return "Unknown" when no conditions match', () => {
        const car = createCar({
          status: 'InService', // Not in qualification eval statuses
          portfolio: false,
          performedTankQual: false,
        });
        const result = calculateShoppingStatus(car, false);
        expect(result.status).toBe('Unknown');
      });
    });

    describe('Edge cases', () => {
      it('should handle partial qualification dates', () => {
        const currentYear = new Date().getFullYear();
        const car = createCar({
          status: 'ToBeRouted',
          safetyRelief: new Date(currentYear, 5, 15),
          serviceEquipment: null,
          tankQualification: null,
        });
        const result = calculateShoppingStatus(car, false);
        expect(result.status).toBe('MustShop');
      });

      it('should check all qualification date fields', () => {
        const currentYear = new Date().getFullYear();
        const car = createCar({
          status: 'ToBeRouted',
          minNoLining: new Date(currentYear - 1, 0, 1), // This should be earliest
          safetyRelief: new Date(currentYear + 1, 5, 15),
        });
        const result = calculateShoppingStatus(car, false);
        expect(result.status).toBe('Urgent');
        expect(result.qualificationType).toBe('minNoLining');
      });
    });
  });
});
