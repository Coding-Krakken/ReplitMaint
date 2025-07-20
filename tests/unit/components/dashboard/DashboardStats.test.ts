import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import DashboardStats from '../../../../client/src/components/dashboard/DashboardStats'

// Mock fetch globally
global.fetch = vi.fn()

const mockFetch = fetch as any

const Wrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('DashboardStats Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render loading state initially', () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        totalWorkOrders: 150,
        pendingWorkOrders: 25,
        completedWorkOrders: 100,
        overdue: 15,
        equipmentCount: 85,
        criticalEquipment: 8
      })
    })

    render(
      <Wrapper>
        <DashboardStats />
      </Wrapper>
    )

    expect(screen.getByText(/loading/i) || screen.getByTestId('loading-spinner')).toBeDefined()
  })

  it('should display dashboard statistics correctly', async () => {
    const mockStats = {
      totalWorkOrders: 150,
      pendingWorkOrders: 25,
      completedWorkOrders: 100,
      overdue: 15,
      equipmentCount: 85,
      criticalEquipment: 8
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockStats
    })

    render(
      <Wrapper>
        <DashboardStats />
      </Wrapper>
    )

    await waitFor(() => {
      expect(screen.getByText('150')).toBeDefined()
      expect(screen.getByText('25')).toBeDefined()
      expect(screen.getByText('100')).toBeDefined()
      expect(screen.getByText('15')).toBeDefined()
      expect(screen.getByText('85')).toBeDefined()
      expect(screen.getByText('8')).toBeDefined()
    })
  })

  it('should handle API error gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    render(
      <Wrapper>
        <DashboardStats />
      </Wrapper>
    )

    await waitFor(() => {
      expect(screen.getByText(/error/i) || screen.getByText(/failed/i)).toBeDefined()
    })
  })

  it('should refresh data when component remounts', async () => {
    const mockStats = {
      totalWorkOrders: 150,
      pendingWorkOrders: 25,
      completedWorkOrders: 100,
      overdue: 15,
      equipmentCount: 85,
      criticalEquipment: 8
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockStats
    })

    const { rerender } = render(
      <Wrapper>
        <DashboardStats />
      </Wrapper>
    )

    await waitFor(() => {
      expect(screen.getByText('150')).toBeDefined()
    })

    // Simulate data update
    const updatedStats = { ...mockStats, totalWorkOrders: 175 }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => updatedStats
    })

    rerender(
      <Wrapper>
        <DashboardStats />
      </Wrapper>
    )

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/dashboard/stats')
    })
  })

  it('should display proper accessibility attributes', async () => {
    const mockStats = {
      totalWorkOrders: 150,
      pendingWorkOrders: 25,
      completedWorkOrders: 100,
      overdue: 15,
      equipmentCount: 85,
      criticalEquipment: 8
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockStats
    })

    render(
      <Wrapper>
        <DashboardStats />
      </Wrapper>
    )

    await waitFor(() => {
      const statsContainer = screen.getByRole('region') || screen.getByTestId('dashboard-stats')
      expect(statsContainer).toBeDefined()
    })
  })
})