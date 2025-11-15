import axios, { AxiosInstance, AxiosRequestConfig } from 'axios'
import { useAuthStore } from '@/stores/authStore'

class ApiClient {
  private client: AxiosInstance
  private csrfToken: string | null = null

  constructor() {
    this.client = axios.create({
      baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
      withCredentials: true, // Required for CSRF token cookies
    })

    this.setupInterceptors()
    this.fetchCsrfToken() // Fetch CSRF token on initialization
  }

  // Fetch CSRF token from server
  private async fetchCsrfToken() {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/csrf-token`, {
        credentials: 'include',
      })
      const data = await response.json()
      if (data.success && data.csrfToken) {
        this.csrfToken = data.csrfToken
      }
    } catch (error) {
      console.warn('Failed to fetch CSRF token:', error)
      // CSRF token fetch failure is not critical for API endpoints using Bearer tokens
    }
  }

  private setupInterceptors() {
    // Request interceptor - add auth token and CSRF token
    this.client.interceptors.request.use(
      async (config) => {
        const token = useAuthStore.getState().accessToken
        if (token) {
          config.headers.Authorization = `Bearer ${token}`
        }

        // Add CSRF token for state-changing requests
        // Note: API endpoints use Bearer tokens, so CSRF is not strictly required,
        // but we add it for defense in depth and for any non-Bearer endpoints
        if (['post', 'put', 'patch', 'delete'].includes(config.method?.toLowerCase() || '')) {
          // Refresh CSRF token if not available
          if (!this.csrfToken) {
            await this.fetchCsrfToken()
          }
          if (this.csrfToken) {
            config.headers['X-CSRF-Token'] = this.csrfToken
          }
        }

        return config
      },
      (error) => Promise.reject(error)
    )

    // Response interceptor - handle auth errors
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config

        // Enhanced error logging
        if (error.config?.url?.includes('/auth/login')) {
          console.error('Login API error:', {
            message: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
            code: error.code,
          })
        }

        // Handle network errors (backend not reachable)
        if (!error.response) {
          console.error('Network error - backend may not be running:', {
            url: error.config?.url,
            baseURL: error.config?.baseURL,
            message: error.message,
            code: error.code,
          })
          return Promise.reject(new Error('Backend server is not reachable. Please ensure the backend is running on http://localhost:3001'))
        }

        // Prevent infinite loop if refresh endpoint itself returns 401
        if (originalRequest.url?.includes("/auth/refresh")) {
          return Promise.reject(error)
        }

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true

          try {
            await useAuthStore.getState().refreshAuth()
            const newToken = useAuthStore.getState().accessToken
            originalRequest.headers.Authorization = `Bearer ${newToken}`
            
            // Refresh CSRF token after re-authentication
            await this.fetchCsrfToken()
            if (this.csrfToken && ['post', 'put', 'patch', 'delete'].includes(originalRequest.method?.toLowerCase() || '')) {
              originalRequest.headers['X-CSRF-Token'] = this.csrfToken
            }
            
            return this.client(originalRequest)
          } catch (refreshError) {
            useAuthStore.getState().logout()
            window.location.href = '/login'
            return Promise.reject(refreshError)
          }
        }

        // Handle CSRF token errors (403)
        if (error.response?.status === 403 && error.response?.data?.code === 'CSRF_TOKEN_INVALID') {
          // Refresh CSRF token and retry
          await this.fetchCsrfToken()
          if (this.csrfToken && originalRequest.headers) {
            originalRequest.headers['X-CSRF-Token'] = this.csrfToken
            return this.client(originalRequest)
          }
        }

        return Promise.reject(error)
      }
    )
  }

  // Generic request method
  async request<T = any>(config: AxiosRequestConfig): Promise<T> {
    const response = await this.client(config)
    return response.data
  }

  // HTTP methods
  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return this.request({ ...config, method: 'GET', url })
  }

  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return this.request({ ...config, method: 'POST', url, data })
  }

  async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return this.request({ ...config, method: 'PUT', url, data })
  }

  async patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return this.request({ ...config, method: 'PATCH', url, data })
  }

  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return this.request({ ...config, method: 'DELETE', url })
  }

  // File upload
  async uploadFile<T = any>(url: string, file: File, config?: AxiosRequestConfig): Promise<T> {
    const formData = new FormData()
    formData.append('file', file)

    return this.request({
      ...config,
      method: 'POST',
      url,
      data: formData,
      headers: {
        ...config?.headers,
        'Content-Type': 'multipart/form-data',
      },
    })
  }

  // Task endpoints
  async createTask(data: {
    title: string
    description?: string
    priority?: string
    dueDate?: string
    assigneeIds: string[]
  }) {
    return this.post<{ success: boolean; message: string; data: any }>('/api/tasks', data)
  }

  async updateTask(id: string, data: {
    title?: string
    description?: string
    priority?: string
    dueDate?: string
    assigneeIds?: string[]
  }) {
    return this.patch<{ success: boolean; message: string; data: any }>(`/api/tasks/${id}`, data)
  }

  async deleteTask(id: string) {
    return this.delete<{ success: boolean; message: string }>(`/api/tasks/${id}`)
  }

  async getTasksAssignedBy(filters?: { status?: string; priority?: string }) {
    const params = new URLSearchParams()
    if (filters?.status) params.append('status', filters.status)
    if (filters?.priority) params.append('priority', filters.priority)
    return this.get<{ success: boolean; data: any[] }>(`/api/tasks/assigned-by?${params.toString()}`)
  }

  async getTasksAssignedTo(filters?: { status?: string; priority?: string }) {
    const params = new URLSearchParams()
    if (filters?.status) params.append('status', filters.status)
    if (filters?.priority) params.append('priority', filters.priority)
    return this.get<{ success: boolean; data: any[] }>(`/api/tasks/assigned-to?${params.toString()}`)
  }

  async getAllTasks(filters?: {
    status?: string
    priority?: string
    assignerId?: string
    assigneeId?: string
    dueDateFrom?: string
    dueDateTo?: string
  }) {
    const params = new URLSearchParams()
    if (filters?.status) params.append('status', filters.status)
    if (filters?.priority) params.append('priority', filters.priority)
    if (filters?.assignerId) params.append('assignerId', filters.assignerId)
    if (filters?.assigneeId) params.append('assigneeId', filters.assigneeId)
    if (filters?.dueDateFrom) params.append('dueDateFrom', filters.dueDateFrom)
    if (filters?.dueDateTo) params.append('dueDateTo', filters.dueDateTo)
    return this.get<{ success: boolean; data: any[] }>(`/api/tasks?${params.toString()}`)
  }

  async getTaskById(id: string) {
    return this.get<{ success: boolean; data: any }>(`/api/tasks/${id}`)
  }

  async updateTaskStatus(id: string, data: { status: string; completionNote?: string }) {
    return this.patch<{ success: boolean; message: string; data: any }>(`/api/tasks/${id}/status`, data)
  }

  // Route optimization endpoints
  async optimizeRoute(data: {
    vehicleId: string
    vehicleRouteId?: string
    nodes: Array<{
      id: string
      position: [number, number]
      priority?: number
      metadata?: Record<string, any>
    }>
    startPosition: [number, number]
    vehicle?: {
      id?: string
      fuelType?: 'gasoline' | 'diesel' | 'electric' | 'hybrid'
      fuelCapacity?: number
      averageSpeed?: number
      fuelConsumptionRate?: number
    }
    options?: {
      algorithm?: 'nearest_neighbor' | 'genetic' | 'ant_colony' | 'hybrid'
      maxIterations?: number
      populationSize?: number
      mutationRate?: number
      timeLimitMs?: number
      priorityWeight?: number
      fuelOptimization?: boolean
    }
    saveToDatabase?: boolean
  }) {
    return this.post<{
      success: boolean
      data: {
        optimizationId?: string
        best: {
          sequence: Array<{
            id: string
            position: [number, number]
            priority: number
            metadata?: Record<string, any>
          }>
          totalDistance: number
          totalTime: number
          fuelCost: number
          efficiency: number
        }
        metadata: {
          algorithm: string
          pattern: string
          optimizationTimeMs: number
          parameters: any
          savings: {
            distance: {
              original?: number
              optimized: number
              saved?: number
              savedPercent?: number
            }
            time: {
              original?: number
              optimized: number
              saved?: number
              savedPercent?: number
            }
            fuel: {
              original?: number
              optimized: number
              saved?: number
              savedPercent?: number
            }
          }
        }
      }
    }>('/api/routes/optimize', data)
  }

  async getOptimizationHistory(vehicleId?: string, limit?: number) {
    const params = new URLSearchParams()
    if (vehicleId) params.append('vehicleId', vehicleId)
    if (limit) params.append('limit', limit.toString())
    return this.get<{
      success: boolean
      data: Array<any>
    }>(`/api/routes/optimize/history?${params.toString()}`)
  }

  async getOptimizationById(id: string) {
    return this.get<{
      success: boolean
      data: any
    }>(`/api/routes/optimize/${id}`)
  }

  async markOptimizationAsApplied(id: string) {
    return this.patch<{
      success: boolean
      data: any
    }>(`/api/routes/optimize/${id}/apply`)
  }

  async getOptimizationStats(vehicleId?: string) {
    const params = new URLSearchParams()
    if (vehicleId) params.append('vehicleId', vehicleId)
    return this.get<{
      success: boolean
      data: {
        totalOptimizations: number
        appliedOptimizations: number
        avgDistanceSavingsPercent: number
        avgTimeSavingsPercent: number
        avgFuelSavingsPercent: number
      }
    }>(`/api/routes/optimize/stats?${params.toString()}`)
  }

  async getAvailableAlgorithms() {
    return this.get<{
      success: boolean
      data: {
        algorithms: Array<{
          id: string
          name: string
          description: string
          complexity: string
          recommended: string
          speed: string
        }>
      }
    }>('/api/routes/optimize/algorithms')
  }
}

export const apiClient = new ApiClient()