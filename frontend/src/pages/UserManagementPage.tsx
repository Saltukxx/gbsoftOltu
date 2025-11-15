import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import {
  Users,
  Shield,
  Search,
  ChevronDown,
  Check,
  X,
  AlertCircle,
} from 'lucide-react'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { RoleGuard, UserRole } from '@/components/guards/RoleGuard'
import { LoadingSpinner, PageLoading } from '@/components/ui/LoadingStates'
import { useToast } from '@/components/ui/Toast'
import type { UserRole as UserRoleType } from '@/types'

interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  role: UserRoleType
  isActive: boolean
  createdAt: string
  employee?: {
    id: string
    employeeNumber: string
    department: string
    position: string
  }
}

const ROLE_LABELS: Record<UserRoleType, string> = {
  PRESIDENT: 'Başkan',
  ADMIN: 'Yönetici',
  SUPERVISOR: 'Supervisor',
  OPERATOR: 'Operatör',
  MESSENGER: 'Mesajcı',
}

const ROLE_COLORS: Record<UserRoleType, string> = {
  PRESIDENT: 'bg-purple-100 text-purple-800',
  ADMIN: 'bg-blue-100 text-blue-800',
  SUPERVISOR: 'bg-green-100 text-green-800',
  OPERATOR: 'bg-yellow-100 text-yellow-800',
  MESSENGER: 'bg-gray-100 text-gray-800',
}

function UserManagementPageContent() {
  const { user: currentUser } = useAuthStore()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [searchTerm, setSearchTerm] = useState('')
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [selectedRole, setSelectedRole] = useState<UserRoleType | null>(null)

  // Fetch users - optimized
  const { data: usersResponse, isLoading, error } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      try {
        return await apiClient.get<{ success: boolean; data: User[]; count: number }>('/api/users')
      } catch (err: any) {
        if (err?.code === 'ECONNREFUSED' || !err?.response) {
          throw new Error('Sunucuya bağlanılamıyor')
        }
        throw err
      }
    },
    refetchOnWindowFocus: false,
    staleTime: 120000, // Consider data fresh for 2 minutes (users don't change often)
    retry: (failureCount, error: any) => {
      if (error?.message?.includes('Sunucuya bağlanılamıyor') || !error?.response) {
        return false
      }
      return failureCount < 2
    },
  })

  // Update user role mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: UserRoleType }) => {
      const response = await apiClient.patch<{ success: boolean; message: string; data: User }>(
        `/api/users/${userId}/role`,
        { role }
      )
      return response
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('Rol güncellendi', `Kullanıcının rolü başarıyla değiştirildi`)
      setEditingUserId(null)
      setSelectedRole(null)
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || 'Rol güncelleme başarısız oldu'
      toast.error('Hata', errorMessage)
    },
  })

  const users = usersResponse?.data || []

  // Memoize filtered users to avoid recalculation on every render
  const filteredUsers = useMemo(() => {
    if (!searchTerm) return users
    const searchLower = searchTerm.toLowerCase()
    return users.filter((user) => {
      return (
        user.email.toLowerCase().includes(searchLower) ||
        user.firstName.toLowerCase().includes(searchLower) ||
        user.lastName.toLowerCase().includes(searchLower) ||
        ROLE_LABELS[user.role].toLowerCase().includes(searchLower) ||
        user.employee?.department?.toLowerCase().includes(searchLower) ||
        user.employee?.position?.toLowerCase().includes(searchLower)
      )
    })
  }, [users, searchTerm])

  const handleRoleChange = (userId: string, currentRole: UserRoleType) => {
    setEditingUserId(userId)
    setSelectedRole(currentRole)
  }

  const handleRoleSave = (userId: string) => {
    if (!selectedRole) return
    updateRoleMutation.mutate({ userId, role: selectedRole })
  }

  const handleRoleCancel = () => {
    setEditingUserId(null)
    setSelectedRole(null)
  }

  if (isLoading) {
    return <PageLoading message="Kullanıcılar yükleniyor..." />
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-gray-600">Kullanıcılar yüklenirken bir hata oluştu</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <Users className="w-6 h-6 mr-2" />
          Kullanıcı Yönetimi
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Kullanıcı rollerini görüntüleyin ve yönetin
        </p>
      </div>

      {/* Search */}
      <div className="bg-white shadow rounded-lg p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Kullanıcı ara (e-posta, isim, rol, departman)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Kullanıcı
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Departman / Pozisyon
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rol
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Durum
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  İşlemler
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    {searchTerm ? 'Arama sonucu bulunamadı' : 'Kullanıcı bulunamadı'}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {user.firstName} {user.lastName}
                        </div>
                        <div className="text-sm text-gray-500">{user.email}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {user.employee ? (
                        <div>
                          <div className="text-sm text-gray-900">{user.employee.department}</div>
                          <div className="text-sm text-gray-500">{user.employee.position}</div>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {editingUserId === user.id ? (
                        <div className="flex items-center space-x-2">
                          <select
                            value={selectedRole || user.role}
                            onChange={(e) => setSelectedRole(e.target.value as UserRoleType)}
                            className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            autoFocus
                          >
                            {Object.entries(ROLE_LABELS).map(([role, label]) => (
                              <option key={role} value={role}>
                                {label}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleRoleSave(user.id)}
                            disabled={updateRoleMutation.isPending}
                            className="text-green-600 hover:text-green-800 disabled:opacity-50"
                            title="Kaydet"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={handleRoleCancel}
                            disabled={updateRoleMutation.isPending}
                            className="text-red-600 hover:text-red-800 disabled:opacity-50"
                            title="İptal"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[user.role]}`}
                        >
                          <Shield className="w-3 h-3 mr-1" />
                          {ROLE_LABELS[user.role]}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          user.isActive
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {user.isActive ? 'Aktif' : 'Pasif'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {editingUserId !== user.id && user.id !== currentUser?.id && (
                        <button
                          onClick={() => handleRoleChange(user.id, user.role)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          Rol Değiştir
                        </button>
                      )}
                      {user.id === currentUser?.id && (
                        <span className="text-gray-400">Siz</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex">
          <AlertCircle className="w-5 h-5 text-blue-600 mr-2 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">Önemli Notlar:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Rol değişikliği yapıldığında kullanıcı oturumu sonlandırılır ve yeni izinlerle tekrar giriş yapması gerekir.</li>
              <li>Son kalan Başkan rolündeki kullanıcının rolü değiştirilemez.</li>
              <li>Kendi rolünüzü değiştiremezsiniz.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function UserManagementPage() {
  return (
    <ErrorBoundary>
      <RoleGuard requiredRole={UserRole.PRESIDENT}>
        <UserManagementPageContent />
      </RoleGuard>
    </ErrorBoundary>
  )
}

