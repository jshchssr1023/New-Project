/**
 * CarSelectionContext - Global car selection state for cross-page persistence
 *
 * Allows users to select cars on one page (e.g., Railcars) and carry that
 * selection to other pages (e.g., Scenario Builder, Car Flow Planning)
 */

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { Car } from '../types';

interface CarSelectionContextType {
  // Selected car IDs
  selectedCarIds: Set<string>;

  // Selected car objects (for display purposes)
  selectedCars: Car[];

  // Selection actions
  selectCar: (car: Car) => void;
  deselectCar: (carId: string) => void;
  toggleCar: (car: Car) => void;
  selectMultiple: (cars: Car[]) => void;
  deselectMultiple: (carIds: string[]) => void;
  clearSelection: () => void;

  // Bulk operations
  isSelected: (carId: string) => boolean;
  selectionCount: number;

  // Navigation helpers
  hasSelection: boolean;
  getSelectionSummary: () => string;
}

const CarSelectionContext = createContext<CarSelectionContextType | null>(null);

export function CarSelectionProvider({ children }: { children: ReactNode }) {
  const [selectedCarIds, setSelectedCarIds] = useState<Set<string>>(new Set());
  const [selectedCars, setSelectedCars] = useState<Car[]>([]);

  const selectCar = useCallback((car: Car) => {
    setSelectedCarIds(prev => {
      const next = new Set(prev);
      next.add(car.id);
      return next;
    });
    setSelectedCars(prev => {
      if (prev.find(c => c.id === car.id)) return prev;
      return [...prev, car];
    });
  }, []);

  const deselectCar = useCallback((carId: string) => {
    setSelectedCarIds(prev => {
      const next = new Set(prev);
      next.delete(carId);
      return next;
    });
    setSelectedCars(prev => prev.filter(c => c.id !== carId));
  }, []);

  const toggleCar = useCallback((car: Car) => {
    setSelectedCarIds(prev => {
      const next = new Set(prev);
      if (next.has(car.id)) {
        next.delete(car.id);
        setSelectedCars(cars => cars.filter(c => c.id !== car.id));
      } else {
        next.add(car.id);
        setSelectedCars(cars => {
          if (cars.find(c => c.id === car.id)) return cars;
          return [...cars, car];
        });
      }
      return next;
    });
  }, []);

  const selectMultiple = useCallback((cars: Car[]) => {
    setSelectedCarIds(prev => {
      const next = new Set(prev);
      cars.forEach(car => next.add(car.id));
      return next;
    });
    setSelectedCars(prev => {
      const existingIds = new Set(prev.map(c => c.id));
      const newCars = cars.filter(c => !existingIds.has(c.id));
      return [...prev, ...newCars];
    });
  }, []);

  const deselectMultiple = useCallback((carIds: string[]) => {
    setSelectedCarIds(prev => {
      const next = new Set(prev);
      carIds.forEach(id => next.delete(id));
      return next;
    });
    setSelectedCars(prev => prev.filter(c => !carIds.includes(c.id)));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedCarIds(new Set());
    setSelectedCars([]);
  }, []);

  const isSelected = useCallback((carId: string) => {
    return selectedCarIds.has(carId);
  }, [selectedCarIds]);

  const getSelectionSummary = useCallback(() => {
    if (selectedCars.length === 0) return 'No cars selected';
    if (selectedCars.length === 1) return `1 car selected: ${selectedCars[0].railcarNumber}`;

    // Group by customer
    const byCustomer: Record<string, number> = {};
    selectedCars.forEach(car => {
      const customer = car.customer || 'Unknown';
      byCustomer[customer] = (byCustomer[customer] || 0) + 1;
    });

    const customerSummary = Object.entries(byCustomer)
      .map(([customer, count]) => `${customer}: ${count}`)
      .join(', ');

    return `${selectedCars.length} cars selected (${customerSummary})`;
  }, [selectedCars]);

  const value: CarSelectionContextType = {
    selectedCarIds,
    selectedCars,
    selectCar,
    deselectCar,
    toggleCar,
    selectMultiple,
    deselectMultiple,
    clearSelection,
    isSelected,
    selectionCount: selectedCarIds.size,
    hasSelection: selectedCarIds.size > 0,
    getSelectionSummary,
  };

  return (
    <CarSelectionContext.Provider value={value}>
      {children}
    </CarSelectionContext.Provider>
  );
}

export function useCarSelection() {
  const context = useContext(CarSelectionContext);
  if (!context) {
    throw new Error('useCarSelection must be used within a CarSelectionProvider');
  }
  return context;
}

// Hook for components that might be outside the provider (optional usage)
export function useCarSelectionOptional() {
  return useContext(CarSelectionContext);
}
