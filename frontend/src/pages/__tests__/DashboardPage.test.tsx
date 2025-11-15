import { describe, it, beforeEach, vi, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DashboardPageContent } from '../DashboardPage'
import type { DashboardSummary, DashboardMetricsResponse, DashboardEmissionsResponse } from '@/types'
import { apiClient } from '@/services/api'

vi.mock('@/services/api', () => ({
  apiClient: {
    get: vi.fn(),
  },
}))

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
    offline: vi.fn(),
    promise: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
    update: vi.fn(),
  }),
  useNetworkStatus: () => ({ isOnline: true }),
}))

const mockedGet = apiClient.get as unknown as ReturnType<typeof vi.fn>

const summaryResponse: DashboardSummary = {
  period: 'today',
  timestamp: new Date().toISOString(),
  shifts: {
    total: 8,
    active: 3,
    completed: 4,
    averageEfficiency: 0.92,
    recent: [
      {
        id: 'shift-1',
        employeeId: 'emp-1',
        day: new Date().toISOString(),
        slot: 'MORNING',
        status: 'ACTIVE',
        employee: { user: { firstName: 'Ayşe', lastName: 'Yılmaz' } },
      },
    ],
  },
  vehicles: {
    total: 12,
    currentlyActive: 5,
    recentLocations: [
      {
        id: 'loc-1',
        vehicleId: 'veh-1',
        latitude: 40.5,
        longitude: 41.0,
        speed: 35,
        recordedAt: new Date().toISOString(),
        vehicle: {
          id: 'veh-1',
          plateNumber: '34 ABC 123',
          type: 'TRUCK',
          model: 'Ford',
          year: 2022,
          fuelType: 'DIESEL',
          fuelCapacity: 120,
          isActive: true,
        },
      },
    ],
  },
  fuel: {
    totalConsumption: 450,
    averageEfficiency: 13.5,
    reports: [
      {
        id: 'fuel-1',
        vehicle: { plateNumber: '34 ABC 123', type: 'TRUCK' },
        period: '2024-02',
        consumptionLiters: 320,
        efficiency: 12,
      },
    ],
  },
  messages: {
    unread: 2,
    recent: [],
  },
  alerts: {
    recent: [
      {
        id: 'alert-1',
        vehicleId: 'veh-1',
        message: 'Ani hızlanma',
        severity: 'HIGH',
        timestamp: new Date().toISOString(),
      },
    ],
    critical: 1,
    high: 2,
  },
}

const metricsResponse: DashboardMetricsResponse = {
  period: {
    days: 14,
    from: new Date(Date.now() - 14 * 86400000).toISOString(),
    to: new Date().toISOString(),
  },
  data: {
    efficiency: [
      { date: new Date().toISOString(), score: 0.92 },
      { date: new Date(Date.now() - 86400000).toISOString(), score: 0.9 },
    ],
    fuel: [
      { period: '2024-01', consumption: 300, efficiency: 12, vehicle: '34 ABC 123' },
      { period: '2024-02', consumption: 320, efficiency: 13, vehicle: '34 DEF 456' },
    ],
    alerts: [
      { date: new Date().toISOString(), total: 4, high: 1, critical: 1 },
      { date: new Date(Date.now() - 86400000).toISOString(), total: 2, high: 1, critical: 0 },
    ],
  },
}

const emissionsResponse: DashboardEmissionsResponse = {
  period: 'month',
  timeRange: {
    start: new Date(Date.now() - 30 * 86400000).toISOString(),
    end: new Date().toISOString(),
  },
  emissions: {
    total_emissions: {
      CO2: 1200,
      NOx: 12,
      PM: 0.4,
    },
  },
  context: {
    totalFuelConsumption: 900,
    activeVehicleCount: 15,
    averageEmissionPerVehicle: 80,
    emissionTrend: 'stable',
  },
  lastUpdated: new Date().toISOString(),
}

const renderWithClient = () => {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={client}>
      <DashboardPageContent />
    </QueryClientProvider>
  )
}

describe('DashboardPageContent', () => {
  beforeEach(() => {
    mockedGet.mockImplementation((url: string) => {
      if (url.includes('/summary')) {
        return Promise.resolve(summaryResponse)
      }
      if (url.includes('/metrics')) {
        return Promise.resolve(metricsResponse)
      }
      if (url.includes('/emissions')) {
        return Promise.resolve(emissionsResponse)
      }
      return Promise.reject(new Error('Unknown endpoint'))
    })
  })

  it('renders dashboard stats and trend insights from live API data', async () => {
    renderWithClient()

    expect(await screen.findByText('Aktif Vardiyalar')).toBeInTheDocument()
    expect(screen.getByText('Araç Durumu')).toBeInTheDocument()
    expect(await screen.findByText('Vardiya Verimliliği (%)')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /vardiya verimlilik trendi/i })).toBeInTheDocument()
  })
})
