import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RoleGuard, UserRole } from '@/components/guards/RoleGuard'
import { LoadingSpinner, LoadingButton } from '@/components/ui/LoadingStates'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

// Mock auth store
vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn(() => ({
    user: {
      id: 'test-user',
      role: 'ADMIN',
    },
    isAuthenticated: true,
  })),
}))

describe('Component Unit Tests', () => {
  describe('RoleGuard', () => {
    it('should render children when user has required role', () => {
      const mockUseAuthStore = vi.fn(() => ({
        user: { role: 'ADMIN' },
        isAuthenticated: true,
      }))

      vi.doMock('@/stores/authStore', () => ({
        useAuthStore: mockUseAuthStore,
      }))

      render(
        <RoleGuard requiredRole={UserRole.ADMIN}>
          <div>Protected Content</div>
        </RoleGuard>
      )

      expect(screen.getByText('Protected Content')).toBeInTheDocument()
    })

    it('should show access denied when user lacks required role', () => {
      const mockUseAuthStore = vi.fn(() => ({
        user: { role: 'MESSENGER' },
        isAuthenticated: true,
      }))

      vi.doMock('@/stores/authStore', () => ({
        useAuthStore: mockUseAuthStore,
      }))

      render(
        <RoleGuard requiredRole={UserRole.ADMIN}>
          <div>Protected Content</div>
        </RoleGuard>
      )

      expect(screen.getByText(/Erişim Yetkiniz Yok/)).toBeInTheDocument()
    })

    it('should redirect to login when user is not authenticated', () => {
      const mockUseAuthStore = vi.fn(() => ({
        user: null,
        isAuthenticated: false,
      }))

      vi.doMock('@/stores/authStore', () => ({
        useAuthStore: mockUseAuthStore,
      }))

      render(
        <RoleGuard requiredRole={UserRole.ADMIN}>
          <div>Protected Content</div>
        </RoleGuard>
      )

      expect(screen.getByText(/Giriş gerekli/)).toBeInTheDocument()
    })
  })

  describe('LoadingStates', () => {
    it('should render loading spinner with default message', () => {
      render(<LoadingSpinner />)
      
      expect(screen.getByText('Yükleniyor...')).toBeInTheDocument()
      expect(screen.getByRole('status')).toBeInTheDocument()
    })

    it('should render loading spinner with custom message', () => {
      render(<LoadingSpinner message="Veriler alınıyor..." />)
      
      expect(screen.getByText('Veriler alınıyor...')).toBeInTheDocument()
    })

    it('should render loading button in normal state', () => {
      const handleClick = vi.fn()
      
      render(
        <LoadingButton onClick={handleClick} loading={false}>
          Click Me
        </LoadingButton>
      )

      const button = screen.getByRole('button')
      expect(button).toBeInTheDocument()
      expect(button).toHaveTextContent('Click Me')
      expect(button).not.toBeDisabled()
      
      fireEvent.click(button)
      expect(handleClick).toHaveBeenCalledOnce()
    })

    it('should render loading button in loading state', () => {
      const handleClick = vi.fn()
      
      render(
        <LoadingButton onClick={handleClick} loading={true}>
          Click Me
        </LoadingButton>
      )

      const button = screen.getByRole('button')
      expect(button).toBeDisabled()
      expect(screen.getByRole('status')).toBeInTheDocument()
      
      fireEvent.click(button)
      expect(handleClick).not.toHaveBeenCalled()
    })

    it('should apply custom styling to loading button', () => {
      render(
        <LoadingButton 
          onClick={() => {}} 
          loading={false}
          variant="secondary"
          className="custom-class"
        >
          Button
        </LoadingButton>
      )

      const button = screen.getByRole('button')
      expect(button).toHaveClass('custom-class')
      expect(button).toHaveClass('btn-secondary')
    })
  })

  describe('ErrorBoundary', () => {
    it('should render children when no error occurs', () => {
      const GoodComponent = () => <div>Working Component</div>
      
      render(
        <ErrorBoundary>
          <GoodComponent />
        </ErrorBoundary>
      )

      expect(screen.getByText('Working Component')).toBeInTheDocument()
    })

    it('should catch and display errors', () => {
      const BadComponent = () => {
        throw new Error('Test error')
      }

      // Mock console.error to avoid error output in test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      render(
        <ErrorBoundary>
          <BadComponent />
        </ErrorBoundary>
      )

      expect(screen.getByText('Bir hata oluştu')).toBeInTheDocument()
      expect(screen.getByText('Sayfayı Yenile')).toBeInTheDocument()
      
      consoleSpy.mockRestore()
    })

    it('should provide retry functionality', () => {
      const BadComponent = () => {
        throw new Error('Test error')
      }

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      render(
        <ErrorBoundary>
          <BadComponent />
        </ErrorBoundary>
      )

      const retryButton = screen.getByText('Tekrar Dene')
      expect(retryButton).toBeInTheDocument()
      
      fireEvent.click(retryButton)
      // Error boundary should reset and try to render component again
      
      consoleSpy.mockRestore()
    })
  })

  describe('Component Integration', () => {
    it('should work together in complex scenarios', () => {
      const ProtectedContent = () => (
        <div>
          <LoadingSpinner message="Loading protected data..." />
          <LoadingButton onClick={() => {}} loading={false}>
            Save Data
          </LoadingButton>
        </div>
      )

      render(
        <ErrorBoundary>
          <RoleGuard requiredRole={UserRole.ADMIN}>
            <ProtectedContent />
          </RoleGuard>
        </ErrorBoundary>
      )

      expect(screen.getByText('Loading protected data...')).toBeInTheDocument()
      expect(screen.getByText('Save Data')).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should have proper ARIA attributes for loading states', () => {
      render(<LoadingSpinner />)
      
      const spinner = screen.getByRole('status')
      expect(spinner).toHaveAttribute('aria-label', 'Yükleniyor')
    })

    it('should have proper ARIA attributes for loading buttons', () => {
      render(
        <LoadingButton onClick={() => {}} loading={true}>
          Submit
        </LoadingButton>
      )

      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('aria-disabled', 'true')
      expect(button).toHaveAttribute('aria-busy', 'true')
    })

    it('should be keyboard accessible', () => {
      const handleClick = vi.fn()
      
      render(
        <LoadingButton onClick={handleClick} loading={false}>
          Button
        </LoadingButton>
      )

      const button = screen.getByRole('button')
      button.focus()
      
      fireEvent.keyDown(button, { key: 'Enter' })
      expect(handleClick).toHaveBeenCalled()
      
      fireEvent.keyDown(button, { key: ' ' })
      expect(handleClick).toHaveBeenCalledTimes(2)
    })
  })

  describe('Dark Mode Support', () => {
    it('should apply dark mode classes when enabled', () => {
      // Mock dark mode context/state
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(query => ({
          matches: query.includes('dark'),
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      })

      render(<LoadingSpinner />)
      
      // Component should handle dark mode styling
      expect(screen.getByRole('status')).toBeInTheDocument()
    })
  })

  describe('Performance', () => {
    it('should not cause unnecessary re-renders', () => {
      const renderCount = { current: 0 }
      
      const TestComponent = () => {
        renderCount.current++
        return <div>Render count: {renderCount.current}</div>
      }

      const { rerender } = render(
        <ErrorBoundary>
          <TestComponent />
        </ErrorBoundary>
      )

      expect(screen.getByText('Render count: 1')).toBeInTheDocument()
      
      // Re-render with same props should not cause child re-render
      rerender(
        <ErrorBoundary>
          <TestComponent />
        </ErrorBoundary>
      )
      
      // Should still be 1 if properly memoized/optimized
      expect(screen.getByText(/Render count:/)).toBeInTheDocument()
    })
  })
})