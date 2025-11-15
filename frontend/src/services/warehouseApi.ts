import { apiClient } from './api'
import type {
  WarehouseItem,
  WarehouseTransaction,
  WarehouseItemCreateInput,
  WarehouseItemUpdateInput,
  CheckoutInput,
  CheckinInput,
  TransferInput,
  AdjustmentInput,
  WarehouseItemsResponse,
  WarehouseTransactionsResponse,
  WarehouseFilters,
  TransactionFilters,
} from '@/types/warehouse'

export const warehouseApi = {
  // Get all warehouse items with filters
  async getWarehouseItems(filters?: WarehouseFilters): Promise<WarehouseItemsResponse> {
    const params = new URLSearchParams()
    
    if (filters?.search) params.append('search', filters.search)
    if (filters?.category) params.append('category', filters.category)
    if (filters?.condition) params.append('condition', filters.condition)
    if (filters?.location) params.append('location', filters.location)
    if (filters?.isActive !== undefined) params.append('isActive', String(filters.isActive))
    if (filters?.page) params.append('page', String(filters.page))
    if (filters?.limit) params.append('limit', String(filters.limit))

    const queryString = params.toString()
    return apiClient.get<WarehouseItemsResponse>(`/api/warehouse/items${queryString ? `?${queryString}` : ''}`)
  },

  // Get single warehouse item
  async getWarehouseItem(id: string): Promise<{ success: boolean; data: WarehouseItem }> {
    return apiClient.get<{ success: boolean; data: WarehouseItem }>(`/api/warehouse/items/${id}`)
  },

  // Create warehouse item
  async createWarehouseItem(data: WarehouseItemCreateInput): Promise<{ success: boolean; message: string; data: WarehouseItem }> {
    return apiClient.post<{ success: boolean; message: string; data: WarehouseItem }>('/api/warehouse/items', data)
  },

  // Update warehouse item
  async updateWarehouseItem(id: string, data: WarehouseItemUpdateInput): Promise<{ success: boolean; message: string; data: WarehouseItem }> {
    return apiClient.patch<{ success: boolean; message: string; data: WarehouseItem }>(`/api/warehouse/items/${id}`, data)
  },

  // Delete warehouse item (soft delete)
  async deleteWarehouseItem(id: string): Promise<{ success: boolean; message: string }> {
    return apiClient.delete<{ success: boolean; message: string }>(`/api/warehouse/items/${id}`)
  },

  // Check out item
  async checkoutItem(id: string, data: CheckoutInput): Promise<{ success: boolean; message: string; data: { item: WarehouseItem; transaction: WarehouseTransaction } }> {
    return apiClient.post<{ success: boolean; message: string; data: { item: WarehouseItem; transaction: WarehouseTransaction } }>(`/api/warehouse/items/${id}/checkout`, data)
  },

  // Check in item
  async checkinItem(id: string, data: CheckinInput): Promise<{ success: boolean; message: string; data: { item: WarehouseItem; transaction: WarehouseTransaction } }> {
    return apiClient.post<{ success: boolean; message: string; data: { item: WarehouseItem; transaction: WarehouseTransaction } }>(`/api/warehouse/items/${id}/checkin`, data)
  },

  // Transfer item
  async transferItem(id: string, data: TransferInput): Promise<{ success: boolean; message: string; data: { item: WarehouseItem; transaction: WarehouseTransaction } }> {
    return apiClient.post<{ success: boolean; message: string; data: { item: WarehouseItem; transaction: WarehouseTransaction } }>(`/api/warehouse/items/${id}/transfer`, data)
  },

  // Adjust quantity
  async adjustQuantity(id: string, data: AdjustmentInput): Promise<{ success: boolean; message: string; data: { item: WarehouseItem; transaction: WarehouseTransaction } }> {
    return apiClient.post<{ success: boolean; message: string; data: { item: WarehouseItem; transaction: WarehouseTransaction } }>(`/api/warehouse/items/${id}/adjustment`, data)
  },

  // Get transactions
  async getTransactions(filters?: TransactionFilters): Promise<WarehouseTransactionsResponse> {
    const params = new URLSearchParams()
    
    if (filters?.itemId) params.append('itemId', filters.itemId)
    if (filters?.userId) params.append('userId', filters.userId)
    if (filters?.type) params.append('type', filters.type)
    if (filters?.startDate) params.append('startDate', filters.startDate)
    if (filters?.endDate) params.append('endDate', filters.endDate)
    if (filters?.page) params.append('page', String(filters.page))
    if (filters?.limit) params.append('limit', String(filters.limit))

    const queryString = params.toString()
    return apiClient.get<WarehouseTransactionsResponse>(`/api/warehouse/transactions${queryString ? `?${queryString}` : ''}`)
  },

  // Get single transaction
  async getTransaction(id: string): Promise<{ success: boolean; data: WarehouseTransaction }> {
    return apiClient.get<{ success: boolean; data: WarehouseTransaction }>(`/api/warehouse/transactions/${id}`)
  },

  // Get assigned items (for current user)
  async getAssignedItems(): Promise<{ success: boolean; data: WarehouseTransaction[] }> {
    return apiClient.get<{ success: boolean; data: WarehouseTransaction[] }>('/api/warehouse/assigned-items')
  },
}

