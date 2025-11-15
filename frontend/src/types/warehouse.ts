export enum WarehouseTransactionType {
  CHECK_IN = 'CHECK_IN',
  CHECK_OUT = 'CHECK_OUT',
  TRANSFER = 'TRANSFER',
  ADJUSTMENT = 'ADJUSTMENT',
}

export enum WarehouseItemCategory {
  EQUIPMENT = 'EQUIPMENT',
  MATERIALS = 'MATERIALS',
  VEHICLES = 'VEHICLES',
  TOOLS = 'TOOLS',
  SUPPLIES = 'SUPPLIES',
  OTHER = 'OTHER',
}

export enum WarehouseItemCondition {
  EXCELLENT = 'EXCELLENT',
  GOOD = 'GOOD',
  FAIR = 'FAIR',
  POOR = 'POOR',
  DAMAGED = 'DAMAGED',
}

export interface WarehouseItem {
  id: string
  name: string
  description?: string | null
  category: WarehouseItemCategory
  sku?: string | null
  quantity: number
  location: string
  condition: WarehouseItemCondition
  isActive: boolean
  deletedAt?: string | null
  createdAt: string
  updatedAt: string
  transactions?: WarehouseTransaction[]
}

export interface WarehouseTransaction {
  id: string
  itemId: string
  type: WarehouseTransactionType
  userId: string
  assignedUserId?: string | null
  quantity: number
  previousQuantity: number
  newQuantity: number
  notes?: string | null
  transferToLocation?: string | null
  createdAt: string
  updatedAt: string
  item?: WarehouseItem
  user?: {
    id: string
    firstName: string
    lastName: string
    email: string
  }
  assignedUser?: {
    id: string
    firstName: string
    lastName: string
    email: string
  } | null
}

export interface WarehouseItemCreateInput {
  name: string
  description?: string
  category: WarehouseItemCategory
  sku?: string
  quantity: number
  location: string
  condition?: WarehouseItemCondition
}

export interface WarehouseItemUpdateInput {
  name?: string
  description?: string
  category?: WarehouseItemCategory
  sku?: string
  location?: string
  condition?: WarehouseItemCondition
  isActive?: boolean
}

export interface CheckoutInput {
  assignedUserId: string
  quantity: number
  notes?: string
}

export interface CheckinInput {
  quantity: number
  notes?: string
}

export interface TransferInput {
  transferToLocation: string
  quantity?: number
  notes?: string
}

export interface AdjustmentInput {
  newQuantity: number
  notes: string
}

export interface WarehouseItemsResponse {
  success: boolean
  data: WarehouseItem[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface WarehouseTransactionsResponse {
  success: boolean
  data: WarehouseTransaction[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface WarehouseFilters {
  search?: string
  category?: WarehouseItemCategory
  condition?: WarehouseItemCondition
  location?: string
  isActive?: boolean
  page?: number
  limit?: number
}

export interface TransactionFilters {
  itemId?: string
  userId?: string
  type?: WarehouseTransactionType
  startDate?: string
  endDate?: string
  page?: number
  limit?: number
}

// Turkish display names
export const categoryDisplayNames: Record<WarehouseItemCategory, string> = {
  [WarehouseItemCategory.EQUIPMENT]: 'Ekipman',
  [WarehouseItemCategory.MATERIALS]: 'Malzeme',
  [WarehouseItemCategory.VEHICLES]: 'Araç',
  [WarehouseItemCategory.TOOLS]: 'Alet',
  [WarehouseItemCategory.SUPPLIES]: 'Tedarik',
  [WarehouseItemCategory.OTHER]: 'Diğer',
}

export const conditionDisplayNames: Record<WarehouseItemCondition, string> = {
  [WarehouseItemCondition.EXCELLENT]: 'Mükemmel',
  [WarehouseItemCondition.GOOD]: 'İyi',
  [WarehouseItemCondition.FAIR]: 'Orta',
  [WarehouseItemCondition.POOR]: 'Kötü',
  [WarehouseItemCondition.DAMAGED]: 'Hasarlı',
}

export const transactionTypeDisplayNames: Record<WarehouseTransactionType, string> = {
  [WarehouseTransactionType.CHECK_IN]: 'Giriş',
  [WarehouseTransactionType.CHECK_OUT]: 'Çıkış',
  [WarehouseTransactionType.TRANSFER]: 'Transfer',
  [WarehouseTransactionType.ADJUSTMENT]: 'Düzeltme',
}

