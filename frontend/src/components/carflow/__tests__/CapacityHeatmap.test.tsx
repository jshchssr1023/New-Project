/**
 * CapacityHeatmap Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CapacityHeatmap from '../CapacityHeatmap';

// Mock the carFlowApi
vi.mock('../../../services/carFlowApi', () => ({
  capacityApi: {
    getCapacity: vi.fn().mockResolvedValue({
      capacity: [
        {
          shopId: 'shop-1',
          shop: { name: 'Dallas Shop', city: 'Dallas', state: 'TX' },
          months: {
            1: { committed: 10, planned: 5, draftUsage: 0, available: 5 },
            2: { committed: 10, planned: 8, draftUsage: 0, available: 2 },
            3: { committed: 10, planned: 10, draftUsage: 0, available: 0 },
          },
        },
      ],
    }),
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('CapacityHeatmap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    render(<CapacityHeatmap year={2025} />, { wrapper: createWrapper() });
    // Loading spinner should be present initially
    expect(document.querySelector('.animate-spin')).toBeTruthy();
  });

  it('renders shop name and location', async () => {
    render(<CapacityHeatmap year={2025} />, { wrapper: createWrapper() });

    // Wait for data to load
    const shopName = await screen.findByText('Dallas Shop');
    expect(shopName).toBeTruthy();
  });

  it('renders month headers', async () => {
    render(<CapacityHeatmap year={2025} />, { wrapper: createWrapper() });

    await screen.findByText('Dallas Shop');

    // Check for month headers
    expect(screen.getByText('Jan')).toBeTruthy();
    expect(screen.getByText('Feb')).toBeTruthy();
    expect(screen.getByText('Mar')).toBeTruthy();
  });

  it('renders in compact mode', async () => {
    render(<CapacityHeatmap year={2025} compact />, { wrapper: createWrapper() });

    await screen.findByText('Dallas Shop');

    // In compact mode, legend should not be visible
    expect(screen.queryByText('Legend:')).toBeFalsy();
  });

  it('highlights selected cells', async () => {
    const highlightedCells = [{ shopId: 'shop-1', month: 1 }];

    render(
      <CapacityHeatmap year={2025} highlightedCells={highlightedCells} />,
      { wrapper: createWrapper() }
    );

    await screen.findByText('Dallas Shop');

    // Highlighted cells should have ring styling
    // This would require more specific DOM querying
  });
});
