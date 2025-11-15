import React, { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Filter, X } from 'lucide-react'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { RoleGuard, UserRole } from '@/components/guards/RoleGuard'
import { PageLoading } from '@/components/ui/LoadingStates'
import { useToast, useNetworkStatus } from '@/components/ui/Toast'
import { useAuthStore } from '@/stores/authStore'
import { apiClient } from '@/services/api'
import { warehouseApi } from '@/services/warehouseApi'
import { websocketService } from '@/services/websocketService'
import { ItemList } from '@/components/warehouse/ItemList'
import { ItemForm } from '@/components/warehouse/ItemForm'
import { ItemDetail } from '@/components/warehouse/ItemDetail'
import { CheckoutModal } from '@/components/warehouse/CheckoutModal'
import { CheckinModal } from '@/components/warehouse/CheckinModal'
import { TransferModal } from '@/components/warehouse/TransferModal'
import { AdjustmentModal } from '@/components/warehouse/AdjustmentModal'
import type {
  WarehouseItem,
  WarehouseItemCreateInput,
  WarehouseItemUpdateInput,
  WarehouseFilters,
  WarehouseItemCategory,
  WarehouseItemCondition,
  CheckoutInput,
  CheckinInput,
  TransferInput,
  AdjustmentInput,
} from '@/types/warehouse'
import {
  WarehouseItemCategory as CategoryEnum,
  WarehouseItemCondition as ConditionEnum,
} from '@/types/warehouse'
import type { User } from '@/types'

function WarehousePageContent() {
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<WarehouseItemCategory | 'all'>('all')
  const [conditionFilter, setConditionFilter] = useState<WarehouseItemCondition | 'all'>('all')
  const [locationFilter, setLocationFilter] = useState('')
  const [isActiveFilter, setIsActiveFilter] = useState<boolean | 'all'>('all')
  const [page, setPage] = useState(1)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showCheckoutModal, setShowCheckoutModal] = useState(false)
  const [showCheckinModal, setShowCheckinModal] = useState(false)
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [showAdjustModal, setShowAdjustModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [selectedItem, setSelectedItem] = useState<WarehouseItem | null>(null)
  const [itemToDelete, setItemToDelete] = useState<WarehouseItem | null>(null)

  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const toast = useToast()
  const { isOnline } = useNetworkStatus()

  // Fetch users for checkout
  const { data: usersResponse } = useQuery({
    queryKey: ['users'],
    queryFn: () => apiClient.get<{ success: boolean; data: any[] }>('/api/employees'),
    retry: 2,
  })

  const users =
    usersResponse?.data?.map((emp: any) => emp.user).filter((u: User) => u.id !== user?.id) || []

  // Build filters
  const filters: WarehouseFilters = useMemo(
    () => ({
      search: searchTerm || undefined,
      category: categoryFilter !== 'all' ? categoryFilter : undefined,
      condition: conditionFilter !== 'all' ? conditionFilter : undefined,
      location: locationFilter || undefined,
      isActive: isActiveFilter !== 'all' ? isActiveFilter : undefined,
      page,
      limit: 20,
    }),
    [searchTerm, categoryFilter, conditionFilter, locationFilter, isActiveFilter, page]
  )

  // Fetch warehouse items
  const {
    data: itemsResponse,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['warehouse-items', filters],
    queryFn: () => warehouseApi.getWarehouseItems(filters),
    enabled: isOnline,
    refetchOnWindowFocus: false,
    staleTime: 30000,
    retry: (failureCount, error: any) => {
      if (error?.message?.includes('Sunucuya bağlanılamıyor') || !error?.response) {
        return false
      }
      return failureCount < 2
    },
  })

  const items = itemsResponse?.data || []
  const pagination = itemsResponse?.pagination

  // Fetch item detail when selected
  const { data: itemDetailResponse } = useQuery({
    queryKey: ['warehouse-item', selectedItem?.id],
    queryFn: () => warehouseApi.getWarehouseItem(selectedItem!.id),
    enabled: !!selectedItem && showDetailModal,
  })

  const itemDetail = itemDetailResponse?.data

  // WebSocket subscription
  useEffect(() => {
    if (!isOnline) return

    const handleItemCreated = (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['warehouse-items'] })
      toast.success('Yeni ürün eklendi', data.item.name)
    }

    const handleItemUpdated = (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['warehouse-items'] })
      queryClient.invalidateQueries({ queryKey: ['warehouse-item'] })
      toast.info('Ürün güncellendi', data.item.name)
    }

    const handleItemDeleted = (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['warehouse-items'] })
      toast.info('Ürün silindi')
    }

    const handleTransactionCreated = (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['warehouse-items'] })
      queryClient.invalidateQueries({ queryKey: ['warehouse-item'] })
      toast.success('İşlem kaydedildi')
    }

    websocketService.on('warehouse:item:created', handleItemCreated)
    websocketService.on('warehouse:item:updated', handleItemUpdated)
    websocketService.on('warehouse:item:deleted', handleItemDeleted)
    websocketService.on('warehouse:transaction:created', handleTransactionCreated)

    return () => {
      websocketService.off('warehouse:item:created', handleItemCreated)
      websocketService.off('warehouse:item:updated', handleItemUpdated)
      websocketService.off('warehouse:item:deleted', handleItemDeleted)
      websocketService.off('warehouse:transaction:created', handleTransactionCreated)
    }
  }, [isOnline, queryClient, toast])

  // Create item mutation
  const createItemMutation = useMutation({
    mutationFn: (data: WarehouseItemCreateInput) => warehouseApi.createWarehouseItem(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse-items'] })
      toast.success('Ürün başarıyla oluşturuldu')
      setShowCreateModal(false)
    },
    onError: (error: any) => {
      toast.error('Ürün oluşturulamadı', error.response?.data?.error || error.message)
    },
  })

  // Update item mutation
  const updateItemMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: WarehouseItemUpdateInput }) =>
      warehouseApi.updateWarehouseItem(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse-items'] })
      queryClient.invalidateQueries({ queryKey: ['warehouse-item'] })
      toast.success('Ürün başarıyla güncellendi')
      setShowEditModal(false)
      setSelectedItem(null)
    },
    onError: (error: any) => {
      toast.error('Ürün güncellenemedi', error.response?.data?.error || error.message)
    },
  })

  // Delete item mutation
  const deleteItemMutation = useMutation({
    mutationFn: (id: string) => warehouseApi.deleteWarehouseItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse-items'] })
      toast.success('Ürün başarıyla silindi')
      setShowDeleteModal(false)
      setItemToDelete(null)
    },
    onError: (error: any) => {
      toast.error('Ürün silinemedi', error.response?.data?.error || error.message)
    },
  })

  // Checkout mutation
  const checkoutMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: CheckoutInput }) =>
      warehouseApi.checkoutItem(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse-items'] })
      queryClient.invalidateQueries({ queryKey: ['warehouse-item'] })
      toast.success('Ürün çıkışı yapıldı')
      setShowCheckoutModal(false)
      setSelectedItem(null)
    },
    onError: (error: any) => {
      toast.error('Çıkış yapılamadı', error.response?.data?.error || error.message)
    },
  })

  // Checkin mutation
  const checkinMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: CheckinInput }) =>
      warehouseApi.checkinItem(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse-items'] })
      queryClient.invalidateQueries({ queryKey: ['warehouse-item'] })
      toast.success('Ürün girişi yapıldı')
      setShowCheckinModal(false)
      setSelectedItem(null)
    },
    onError: (error: any) => {
      toast.error('Giriş yapılamadı', error.response?.data?.error || error.message)
    },
  })

  // Transfer mutation
  const transferMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: TransferInput }) =>
      warehouseApi.transferItem(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse-items'] })
      queryClient.invalidateQueries({ queryKey: ['warehouse-item'] })
      toast.success('Ürün transfer edildi')
      setShowTransferModal(false)
      setSelectedItem(null)
    },
    onError: (error: any) => {
      toast.error('Transfer yapılamadı', error.response?.data?.error || error.message)
    },
  })

  // Adjustment mutation
  const adjustmentMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: AdjustmentInput }) =>
      warehouseApi.adjustQuantity(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse-items'] })
      queryClient.invalidateQueries({ queryKey: ['warehouse-item'] })
      toast.success('Miktar düzeltildi')
      setShowAdjustModal(false)
      setSelectedItem(null)
    },
    onError: (error: any) => {
      toast.error('Düzeltme yapılamadı', error.response?.data?.error || error.message)
    },
  })

  const handleCreate = async (data: WarehouseItemCreateInput) => {
    await createItemMutation.mutateAsync(data)
  }

  const handleUpdate = async (data: WarehouseItemUpdateInput) => {
    if (!selectedItem) return
    await updateItemMutation.mutateAsync({ id: selectedItem.id, data })
  }

  const handleDelete = () => {
    if (!itemToDelete) return
    deleteItemMutation.mutate(itemToDelete.id)
  }

  const handleCheckout = async (data: CheckoutInput) => {
    if (!selectedItem) return
    await checkoutMutation.mutateAsync({ id: selectedItem.id, data })
  }

  const handleCheckin = async (data: CheckinInput) => {
    if (!selectedItem) return
    await checkinMutation.mutateAsync({ id: selectedItem.id, data })
  }

  const handleTransfer = async (data: TransferInput) => {
    if (!selectedItem) return
    await transferMutation.mutateAsync({ id: selectedItem.id, data })
  }

  const handleAdjust = async (data: AdjustmentInput) => {
    if (!selectedItem) return
    await adjustmentMutation.mutateAsync({ id: selectedItem.id, data })
  }

  const clearFilters = () => {
    setSearchTerm('')
    setCategoryFilter('all')
    setConditionFilter('all')
    setLocationFilter('')
    setIsActiveFilter('all')
    setPage(1)
  }

  const hasActiveFilters =
    searchTerm || categoryFilter !== 'all' || conditionFilter !== 'all' || locationFilter || isActiveFilter !== 'all'

  if (error) {
    return (
      <div className="p-6">
        <div className="card p-6 text-center">
          <p className="text-red-600">Hata: {error instanceof Error ? error.message : 'Bilinmeyen hata'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Depo Yönetimi</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn btn-primary flex items-center space-x-2"
        >
          <Plus className="w-5 h-5" />
          <span>Yeni Ürün Ekle</span>
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as WarehouseItemCategory | 'all')}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Tüm Kategoriler</option>
            {Object.values(CategoryEnum).map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <select
            value={conditionFilter}
            onChange={(e) => setConditionFilter(e.target.value as WarehouseItemCondition | 'all')}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Tüm Durumlar</option>
            {Object.values(ConditionEnum).map((cond) => (
              <option key={cond} value={cond}>
                {cond}
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Konum..."
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <div className="flex items-center space-x-2">
            <select
              value={isActiveFilter === 'all' ? 'all' : String(isActiveFilter)}
              onChange={(e) =>
                setIsActiveFilter(e.target.value === 'all' ? 'all' : e.target.value === 'true')
              }
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Tümü</option>
              <option value="true">Aktif</option>
              <option value="false">Pasif</option>
            </select>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="p-2 text-gray-500 hover:text-gray-700"
                title="Filtreleri Temizle"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Items List */}
      <ItemList
        items={items}
        isLoading={isLoading}
        onEdit={(item) => {
          setSelectedItem(item)
          setShowEditModal(true)
        }}
        onDelete={(item) => {
          setItemToDelete(item)
          setShowDeleteModal(true)
        }}
        onCheckout={(item) => {
          setSelectedItem(item)
          setShowCheckoutModal(true)
        }}
        onCheckin={(item) => {
          setSelectedItem(item)
          setShowCheckinModal(true)
        }}
        onTransfer={(item) => {
          setSelectedItem(item)
          setShowTransferModal(true)
        }}
        onAdjust={(item) => {
          setSelectedItem(item)
          setShowAdjustModal(true)
        }}
        onViewDetail={(item) => {
          setSelectedItem(item)
          setShowDetailModal(true)
        }}
      />

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-700">
            Toplam {pagination.total} ürün, Sayfa {pagination.page} / {pagination.totalPages}
          </p>
          <div className="flex space-x-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Önceki
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={page === pagination.totalPages}
              className="px-4 py-2 border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Sonraki
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      <ItemForm
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreate}
      />

      <ItemForm
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false)
          setSelectedItem(null)
        }}
        onSubmit={handleUpdate}
        item={selectedItem || undefined}
      />

      <ItemDetail
        item={itemDetail || selectedItem}
        isOpen={showDetailModal}
        onClose={() => {
          setShowDetailModal(false)
          setSelectedItem(null)
        }}
      />

      <CheckoutModal
        isOpen={showCheckoutModal}
        onClose={() => {
          setShowCheckoutModal(false)
          setSelectedItem(null)
        }}
        onSubmit={handleCheckout}
        users={users}
        maxQuantity={selectedItem?.quantity || 0}
      />

      <CheckinModal
        isOpen={showCheckinModal}
        onClose={() => {
          setShowCheckinModal(false)
          setSelectedItem(null)
        }}
        onSubmit={handleCheckin}
      />

      <TransferModal
        isOpen={showTransferModal}
        onClose={() => {
          setShowTransferModal(false)
          setSelectedItem(null)
        }}
        onSubmit={handleTransfer}
        currentLocation={selectedItem?.location || ''}
        maxQuantity={selectedItem?.quantity || 0}
      />

      <AdjustmentModal
        isOpen={showAdjustModal}
        onClose={() => {
          setShowAdjustModal(false)
          setSelectedItem(null)
        }}
        onSubmit={handleAdjust}
        currentQuantity={selectedItem?.quantity || 0}
      />

      {/* Delete Confirmation */}
      {showDeleteModal && itemToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Ürünü Sil</h2>
            <p className="text-gray-600 mb-6">
              "{itemToDelete.name}" adlı ürünü silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false)
                  setItemToDelete(null)
                }}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                İptal
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-white bg-red-600 rounded-md hover:bg-red-700"
              >
                Sil
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function WarehousePage() {
  return (
    <ErrorBoundary>
      <RoleGuard requiredRole={[UserRole.DEPO_KULLANICISI, UserRole.ADMIN, UserRole.PRESIDENT]}>
        <WarehousePageContent />
      </RoleGuard>
    </ErrorBoundary>
  )
}

