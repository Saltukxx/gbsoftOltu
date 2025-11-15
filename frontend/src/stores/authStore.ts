import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, AuthResponse, LoginCredentials } from '@/types'
import { authService } from '@/services/authService'

interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
}

interface AuthActions {
  login: (credentials: LoginCredentials) => Promise<void>
  logout: () => void
  refreshAuth: () => Promise<void>
  setUser: (user: User) => void
  clearError: () => void
  setLoading: (loading: boolean) => void
}

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set, get) => ({
      // State
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      // Actions
      login: async (credentials: LoginCredentials) => {
        try {
          set({ isLoading: true, error: null })
          
          console.log('Attempting login for:', credentials.email)
          const response = await authService.login(credentials)
          console.log('Login response received:', { success: response.success, user: response.user?.email })
          
          if (!response || !response.user || !response.accessToken) {
            throw new Error('Invalid response from server')
          }
          
          set({
            user: response.user,
            accessToken: response.accessToken,
            refreshToken: response.refreshToken,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          })
          
          console.log('Login successful, user stored in state')
        } catch (error: any) {
          console.error('Login error in store:', error)
          const errorMessage = error.message || error.response?.data?.error || error.response?.data?.message || 'Login failed'
          set({
            isLoading: false,
            error: errorMessage,
            isAuthenticated: false,
          })
          throw error
        }
      },

      logout: () => {
        authService.logout()
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
        })
      },

      refreshAuth: async () => {
        try {
          const { refreshToken } = get()
          if (!refreshToken) {
            throw new Error('No refresh token available')
          }

          const response = await authService.refreshToken(refreshToken)
          
          set({
            accessToken: response.accessToken,
            // Update refresh token if a new one is provided (token rotation)
            refreshToken: response.refreshToken || get().refreshToken,
            error: null,
          })
        } catch (error) {
          // If refresh fails, logout user
          get().logout()
          throw error
        }
      },

      setUser: (user: User) => {
        set({ user })
      },

      clearError: () => {
        set({ error: null })
      },

      setLoading: (loading: boolean) => {
        set({ isLoading: loading })
      },
    }),
    {
      name: 'auth-storage',
      // Use sessionStorage instead of localStorage for better security
      // Tokens will be cleared when the browser session ends
      storage: {
        getItem: (name) => {
          const str = sessionStorage.getItem(name);
          return str ? JSON.parse(str) : null;
        },
        setItem: (name, value) => {
          sessionStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: (name) => {
          sessionStorage.removeItem(name);
        },
      },
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)

// Helper to check if user has required role
export const useHasRole = (requiredRole: string | string[]) => {
  const user = useAuthStore((state) => state.user)
  
  if (!user) return false
  
  const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole]
  
  const roleHierarchy = {
    MESSENGER: 1,
    OPERATOR: 2,
    DEPO_KULLANICISI: 2.5,
    SUPERVISOR: 3,
    ADMIN: 4,
    PRESIDENT: 5,
  }
  
  const userLevel = roleHierarchy[user.role as keyof typeof roleHierarchy] || 0
  const requiredLevel = Math.min(...roles.map(role => roleHierarchy[role as keyof typeof roleHierarchy] || 0))
  
  return userLevel >= requiredLevel
}