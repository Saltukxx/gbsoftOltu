import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import DashboardPage from '@/pages/DashboardPage'
import ShiftsPage from '@/pages/ShiftsPage'
import VehiclesPage from '@/pages/VehiclesPage'
import MessagesPage from '@/pages/MessagesPage'

// Mock the auth store
vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn(),
}))

// Mock API client
vi.mock('@/services/api', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

// Mock WebSocket service
vi.mock('@/services/websocketService', () => ({
  websocketService: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    subscribeToShifts: vi.fn(),
    unsubscribeFromShifts: vi.fn(),
    subscribeToMessages: vi.fn(),
    unsubscribeFromMessages: vi.fn(),
    subscribeToVehicles: vi.fn(),
    unsubscribeFromVehicles: vi.fn(),
    onShiftUpdate: vi.fn(),
    onNewMessage: vi.fn(),
    onVehicleLocation: vi.fn(),
    onTelemetryAlert: vi.fn(),
    onTypingIndicator: vi.fn(),
    isConnected: vi.fn(() => true),
  },
}))

// Mock role guard
vi.mock('@/components/guards/RoleGuard', () => ({
  RoleGuard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  usePermission: () => ({
    hasRole: vi.fn(() => true),
  }),
  UserRole: {
    ADMIN: 'ADMIN',
    SUPERVISOR: 'SUPERVISOR', 
    OPERATOR: 'OPERATOR',
    MESSENGER: 'MESSENGER',
  },
}))

const mockAuthStore = {
  user: {
    id: 'test-user-id',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    role: 'ADMIN',
  },
  isAuthenticated: true,
  accessToken: 'mock-token',
  login: vi.fn(),
  logout: vi.fn(),
  refreshAuth: vi.fn(),
}

function TestWrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {children}
      </BrowserRouter>
    </QueryClientProvider>
  )
}

describe('Page Integration Tests', () => {
  beforeEach(() => {
    vi.mocked(useAuthStore).mockReturnValue(mockAuthStore)
    vi.clearAllMocks()
  })

  describe('DashboardPage', () => {
    it('should render dashboard layout', async () => {
      render(
        <TestWrapper>
          <DashboardPage />
        </TestWrapper>
      )

      expect(screen.getByText('Dashboard')).toBeInTheDocument()
      
      // Check for key dashboard elements
      await waitFor(() => {
        expect(screen.getByText('Toplam Araç')).toBeInTheDocument()
        expect(screen.getByText('Aktif Vardiyalar')).toBeInTheDocument()
        expect(screen.getByText('Okunmamış Mesajlar')).toBeInTheDocument()
      })
    })

    it('should display welcome message', () => {
      render(
        <TestWrapper>
          <DashboardPage />
        </TestWrapper>
      )

      expect(screen.getByText(/Hoş geldiniz/)).toBeInTheDocument()
      expect(screen.getByText(/Test User/)).toBeInTheDocument()
    })
  })

  describe('ShiftsPage', () => {
    it('should render shifts management interface', async () => {
      render(
        <TestWrapper>
          <ShiftsPage />
        </TestWrapper>
      )

      expect(screen.getByText('Vardiya Planlama')).toBeInTheDocument()
      
      await waitFor(() => {
        expect(screen.getByText('Haftalık vardiya programını yönetin ve düzenleyin')).toBeInTheDocument()
        expect(screen.getByText('Plan Oluştur')).toBeInTheDocument()
      })
    })

    it('should show week selector', () => {
      render(
        <TestWrapper>
          <ShiftsPage />
        </TestWrapper>
      )

      const dateInput = screen.getByDisplayValue(/\d{4}-\d{2}-\d{2}/)
      expect(dateInput).toBeInTheDocument()
      expect(dateInput).toHaveAttribute('type', 'date')
    })

    it('should display shift statistics', async () => {
      render(
        <TestWrapper>
          <ShiftsPage />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Toplam Vardiya')).toBeInTheDocument()
        expect(screen.getByText('Aktif')).toBeInTheDocument()
        expect(screen.getByText('Planlanmış')).toBeInTheDocument()
        expect(screen.getByText('Çalışan')).toBeInTheDocument()
      })
    })
  })

  describe('VehiclesPage', () => {
    it('should render vehicles interface', async () => {
      render(
        <TestWrapper>
          <VehiclesPage />
        </TestWrapper>
      )

      expect(screen.getByText('Araçlar')).toBeInTheDocument()
      
      await waitFor(() => {
        expect(screen.getByText('Araç filosunu takip edin')).toBeInTheDocument()
      })
    })

    it('should show vehicle filters', async () => {
      render(
        <TestWrapper>
          <VehiclesPage />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Tümü')).toBeInTheDocument()
        expect(screen.getByText('Aktif')).toBeInTheDocument()
        expect(screen.getByText('Bakımda')).toBeInTheDocument()
      })
    })
  })

  describe('MessagesPage', () => {
    it('should render messaging interface', async () => {
      render(
        <TestWrapper>
          <MessagesPage />
        </TestWrapper>
      )

      expect(screen.getByText('Mesajlar')).toBeInTheDocument()
      
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Konuşma ara...')).toBeInTheDocument()
      })
    })

    it('should show message filters', async () => {
      render(
        <TestWrapper>
          <MessagesPage />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Tümü')).toBeInTheDocument()
        expect(screen.getByText('Okunmamış')).toBeInTheDocument()
        expect(screen.getByText('Acil')).toBeInTheDocument()
      })
    })

    it('should display conversation list area', async () => {
      render(
        <TestWrapper>
          <MessagesPage />
        </TestWrapper>
      )

      expect(screen.getByText('Mesajlaşmaya Başlayın')).toBeInTheDocument()
      expect(screen.getByText('Soldaki listeden bir konuşma seçin')).toBeInTheDocument()
    })
  })

  describe('User Interactions', () => {
    it('should handle search functionality', async () => {
      render(
        <TestWrapper>
          <MessagesPage />
        </TestWrapper>
      )

      const searchInput = screen.getByPlaceholderText('Konuşma ara...')
      fireEvent.change(searchInput, { target: { value: 'test search' } })
      
      expect(searchInput).toHaveValue('test search')
    })

    it('should handle filter changes', async () => {
      render(
        <TestWrapper>
          <VehiclesPage />
        </TestWrapper>
      )

      await waitFor(() => {
        const activeFilter = screen.getByText('Aktif')
        fireEvent.click(activeFilter)
        // Visual feedback should be present (active state)
        expect(activeFilter.closest('button')).toBeInTheDocument()
      })
    })
  })

  describe('Error States', () => {
    it('should handle loading states gracefully', () => {
      render(
        <TestWrapper>
          <DashboardPage />
        </TestWrapper>
      )

      // Should not crash during loading
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
    })

    it('should display when no data is available', async () => {
      render(
        <TestWrapper>
          <MessagesPage />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Mesajlaşmaya Başlayın')).toBeInTheDocument()
      })
    })
  })

  describe('Responsive Design', () => {
    it('should render mobile-friendly layouts', () => {
      // Set mobile viewport
      global.innerWidth = 375
      global.dispatchEvent(new Event('resize'))

      render(
        <TestWrapper>
          <DashboardPage />
        </TestWrapper>
      )

      // Should still render main content
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should have proper heading structure', () => {
      render(
        <TestWrapper>
          <DashboardPage />
        </TestWrapper>
      )

      const mainHeading = screen.getByRole('heading', { level: 1 })
      expect(mainHeading).toBeInTheDocument()
      expect(mainHeading).toHaveTextContent('Dashboard')
    })

    it('should have accessible form controls', async () => {
      render(
        <TestWrapper>
          <MessagesPage />
        </TestWrapper>
      )

      await waitFor(() => {
        const searchInput = screen.getByPlaceholderText('Konuşma ara...')
        expect(searchInput).toHaveAttribute('type', 'text')
      })
    })

    it('should have proper button accessibility', async () => {
      render(
        <TestWrapper>
          <ShiftsPage />
        </TestWrapper>
      )

      await waitFor(() => {
        const generateButton = screen.getByText('Plan Oluştur')
        expect(generateButton).toHaveAttribute('type', 'button')
      })
    })
  })
})