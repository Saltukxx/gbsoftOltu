import type { LoginCredentials, AuthResponse } from '@/types'
import { apiClient } from './api'

class AuthService {
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      const response = await apiClient.post('/api/auth/login', credentials)
      return response
    } catch (error: any) {
      // Enhanced error logging for debugging
      console.error('Login error:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        statusText: error.response?.statusText,
      })
      
      // Re-throw with better error message
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error)
      } else if (error.response?.data?.message) {
        throw new Error(error.response.data.message)
      } else if (error.message) {
        throw error
      } else {
        throw new Error('Login failed. Please check your connection and try again.')
      }
    }
  }

  async refreshToken(refreshToken: string): Promise<{ accessToken: string; refreshToken?: string }> {
    return apiClient.post('/api/auth/refresh', { refreshToken })
  }

  async getProfile() {
    return apiClient.get('/api/auth/me')
  }

  async logout() {
    try {
      // Get stored tokens for proper logout (from sessionStorage, not localStorage)
      const authStorage = sessionStorage.getItem('auth-storage')
      let refreshToken = null
      
      if (authStorage) {
        const parsed = JSON.parse(authStorage)
        refreshToken = parsed?.state?.refreshToken
      }

      // Call backend logout endpoint
      await apiClient.post('/api/auth/logout', {
        refreshToken
      })
    } catch (error) {
      console.warn('Logout request failed:', error)
      // Continue with cleanup even if server request fails
    } finally {
      // Clear session storage regardless of server response
      sessionStorage.removeItem('auth-storage')
      sessionStorage.removeItem('accessToken')
      sessionStorage.removeItem('refreshToken')
      // Also clear any legacy localStorage entries
      localStorage.removeItem('auth-storage')
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
    }
  }

  async changePassword(payload: { currentPassword: string; newPassword: string; confirmPassword: string }) {
    return apiClient.post('/api/auth/change-password', payload)
  }
}

export const authService = new AuthService()