import React, { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DndContext, DragEndEvent, DragStartEvent, useDraggable, useDroppable, DragOverlay, closestCenter } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { apiClient } from '@/services/api'
import { websocketService } from '@/services/websocketService'
import { useAuthStore, useHasRole } from '@/stores/authStore'
import { 
  Calendar,
  Plus,
  Clock,
  User,
  Filter,
  Download,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  XCircle,
  X,
  TrendingUp,
  Users,
  AlertTriangle,
  Lightbulb
} from 'lucide-react'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { RoleGuard, UserRole, usePermission } from '@/components/guards/RoleGuard'
import { LoadingSpinner, PageLoading, LoadingButton } from '@/components/ui/LoadingStates'
import { useToast, useNetworkStatus } from '@/components/ui/Toast'
import type { Shift, Employee, ShiftSlot } from '@/types'

interface SlotMetadata {
  code: string
  label: string
  timeRange: string
  startTime: string
  endTime: string
}

interface ShiftPlannerData {
  shifts: Shift[]
  employees: Employee[]
  slots: SlotMetadata[]
  period: {
    startDate: string
    endDate: string
    week: string
  }
}

interface GenerationResults {
  metrics?: {
    efficiency_score?: number
    coverage?: number
    balance_score?: number
  }
  violations?: string[]
  recommendations?: string[]
  totalShifts?: number
  employeeCount?: number
}

function ShiftsPageContent() {
  const [selectedWeek, setSelectedWeek] = useState(() => {
    const today = new Date()
    const monday = new Date(today.setDate(today.getDate() - today.getDay() + 1))
    return monday.toISOString().split('T')[0]
  })
  const [isGenerating, setIsGenerating] = useState(false)
  const [draggedShift, setDraggedShift] = useState<Shift | null>(null)
  const [generationResults, setGenerationResults] = useState<GenerationResults | null>(null)
  const [showResults, setShowResults] = useState(false)
  
  const { hasRole } = usePermission()
  const canManageShifts = hasRole(UserRole.SUPERVISOR)
  const canViewAll = hasRole(UserRole.OPERATOR)
  const queryClient = useQueryClient()
  const toast = useToast()
  const { isOnline } = useNetworkStatus()

  // Fetch shifts and employees data
  const { data: shiftsResponse, isLoading, error } = useQuery({
    queryKey: ['shifts', selectedWeek],
    queryFn: async () => {
      try {
        return await apiClient.get<{ success: boolean; data: ShiftPlannerData }>(`/api/shifts?week=${selectedWeek}`)
      } catch (err: any) {
        if (err?.code === 'ECONNREFUSED' || !err?.response) {
          throw new Error('Sunucuya bağlanılamıyor')
        }
        throw err
      }
    },
    enabled: isOnline,
    refetchOnWindowFocus: false,
    staleTime: 30000, // Consider data fresh for 30 seconds
    retry: (failureCount, error: any) => {
      if (error?.message?.includes('Sunucuya bağlanılamıyor') || !error?.response) {
        return false
      }
      return failureCount < 2
    },
    onError: (error: any) => {
      if (!error?.message?.includes('Sunucuya bağlanılamıyor')) {
        toast.error('Vardiya verileri alınamadı', error.message)
      }
    }
  })

  const shiftsData = shiftsResponse?.data

  const { data: employees, error: employeesError } = useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      try {
        return await apiClient.get<Employee[]>('/api/employees')
      } catch (err: any) {
        if (err?.code === 'ECONNREFUSED' || !err?.response) {
          throw new Error('Sunucuya bağlanılamıyor')
        }
        throw err
      }
    },
    enabled: canManageShifts && isOnline,
    refetchOnWindowFocus: false,
    staleTime: 60000, // Consider data fresh for 60 seconds (employees don't change often)
    retry: (failureCount, error: any) => {
      if (error?.message?.includes('Sunucuya bağlanılamıyor') || !error?.response) {
        return false
      }
      return failureCount < 1
    },
    onError: (error: any) => {
      if (!error?.message?.includes('Sunucuya bağlanılamıyor')) {
        toast.error('Çalışan verileri alınamadı', error.message)
      }
    }
  })

  // Generate shifts mutation
  const generateShiftsMutation = useMutation({
    mutationFn: (data: { employees: string[], period: { start_date: string, end_date: string }, constraints: any }) =>
      apiClient.post('/api/shifts/generate', data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] })
      toast.success('Vardiya planı başarıyla oluşturuldu!')
      
      // Store results for display
      if (response.data?.data) {
        setGenerationResults({
          metrics: response.data.data.metrics,
          violations: response.data.data.violations,
          recommendations: response.data.data.recommendations,
          totalShifts: response.data.metadata?.totalShifts,
          employeeCount: response.data.metadata?.employeeCount
        })
        setShowResults(true)
      }
    },
    onError: (error: any) => {
      toast.error('Vardiya planı oluşturulurken hata oluştu', error.message)
    }
  })

  // Update shift mutation
  const updateShiftMutation = useMutation({
    mutationFn: ({ shiftId, updates }: { shiftId: string, updates: Partial<Shift> }) =>
      apiClient.patch(`/api/shifts/${shiftId}`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] })
      toast.success('Vardiya güncellendi')
    },
    onError: (error: any) => {
      toast.error('Vardiya güncellenirken hata oluştu', error.message)
    }
  })

  // WebSocket integration
  useEffect(() => {
    const handleShiftUpdate = (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] })
      toast.success(`Vardiya güncellendi: ${data.employee.user.firstName} ${data.employee.user.lastName}`)
    }

    if (isOnline) {
      websocketService.subscribeToShifts()
      websocketService.onShiftUpdate(handleShiftUpdate)
    }

    return () => {
      // Properly cleanup listeners to prevent memory leaks
      websocketService.offShiftUpdate(handleShiftUpdate)
      websocketService.unsubscribeFromShifts()
    }
  }, [queryClient, isOnline])

  // Drag and drop handling
  const handleDragStart = (event: DragStartEvent) => {
    const shift = shiftsData?.shifts.find(s => s.id === event.active.id)
    setDraggedShift(shift || null)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggedShift(null)

    const { active, over } = event

    if (!over || !canManageShifts || !isOnline) {
      if (!isOnline) {
        toast.warning('Offline modda değişiklik yapılamaz', 'Bağlantınızı kontrol edin')
      }
      return
    }

    // Don't update if dropped in the same position
    if (active.id === over.id) {
      return
    }

    // Parse destination slot info - format: ${dayKey}__${slot.code}
    const [destDay, destSlot] = over.id.toString().split('__')
    const shift = shiftsData?.shifts.find(s => s.id === active.id)

    if (!shift || !destDay || !destSlot) {
      toast.error('Geçersiz hedef konum', 'Lütfen tekrar deneyin')
      return
    }

    // Validate slot is a valid ShiftSlot
    const validSlots: ShiftSlot[] = ['MORNING', 'AFTERNOON', 'NIGHT']
    if (!validSlots.includes(destSlot as ShiftSlot)) {
      toast.error('Geçersiz vardiya saati', 'Lütfen geçerli bir saat seçin')
      return
    }

    // Update shift with ISO date string (YYYY-MM-DD) and enum slot
    updateShiftMutation.mutate({
      shiftId: shift.id,
      updates: {
        day: destDay, // Already in YYYY-MM-DD format from dayKey
        slot: destSlot as ShiftSlot
      }
    })
  }

  const generateShifts = async () => {
    if (!employees?.data?.length) return
    
    setIsGenerating(true)
    try {
      const weekStart = new Date(selectedWeek)
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekEnd.getDate() + 6)

      await generateShiftsMutation.mutateAsync({
        employees: employees.data.map(e => e.id),
        period: {
          start_date: weekStart.toISOString(),
          end_date: weekEnd.toISOString()
        },
        constraints: {
          maxShiftsPerEmployee: 5,
          minRestBetweenShifts: 12,
          preferredSlots: {}
        }
      })
    } finally {
      setIsGenerating(false)
    }
  }

  // Memoize shift filtering function
  const getShiftsByDayAndSlot = useCallback((day: string, slotCode: string) => {
    return shiftsData?.shifts.filter(shift => 
      shift.day === day && shift.slot === slotCode
    ) || []
  }, [shiftsData?.shifts])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-green-100 text-green-800 border-green-200'
      case 'COMPLETED': return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'SCHEDULED': return 'bg-gray-100 text-gray-800 border-gray-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ACTIVE': return <CheckCircle className="w-3 h-3" />
      case 'COMPLETED': return <CheckCircle className="w-3 h-3" />
      case 'SCHEDULED': return <Clock className="w-3 h-3" />
      default: return <XCircle className="w-3 h-3" />
    }
  }

  // Droppable component
  const DroppableSlot = ({
    id,
    children
  }: {
    id: string
    children: React.ReactNode
  }) => {
    const { setNodeRef, isOver } = useDroppable({
      id,
    })

    return (
      <div
        ref={setNodeRef}
        className={`
          min-h-[100px] p-2 rounded-lg border-2 border-dashed transition-colors
          ${isOver
            ? 'border-blue-300 bg-blue-50'
            : 'border-gray-200 bg-gray-50'
          }
        `}
      >
        {children}
      </div>
    )
  }

  // Draggable component
  const DraggableShift = ({
    shift,
    disabled
  }: {
    shift: Shift
    disabled: boolean
  }) => {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
      id: shift.id,
      disabled,
    })

    const style = {
      transform: CSS.Translate.toString(transform),
    }

    return (
      <div
        ref={setNodeRef}
        style={style}
        {...listeners}
        {...attributes}
        className={`
          p-2 rounded border text-xs transition-transform
          ${getStatusColor(shift.status)}
          ${isDragging ? 'opacity-50 shadow-lg' : 'hover:shadow-md'}
          ${!disabled ? 'cursor-move' : 'cursor-default'}
        `}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1">
            {getStatusIcon(shift.status)}
            <span className="font-medium">
              {shift.employee.user.firstName} {shift.employee.user.lastName}
            </span>
          </div>
        </div>
        <div className="text-xs opacity-75 mt-1">
          {shift.employee.department}
        </div>
      </div>
    )
  }

  if (isLoading) {
    return <PageLoading message="Vardiya verileri yükleniyor..." />
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <AlertTriangle className="w-12 h-12 text-red-500" />
        <div className="text-center">
          <h3 className="text-lg font-medium text-gray-900">Veriler Yüklenemedi</h3>
          <p className="text-sm text-gray-500 mt-1">Vardiya verileri alınamadı. Lütfen tekrar deneyin.</p>
        </div>
        <button 
          onClick={() => queryClient.invalidateQueries({ queryKey: ['shifts'] })}
          className="btn btn-primary"
        >
          Tekrar Dene
        </button>
      </div>
    )
  }

  const weekDays = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']
  const slots = shiftsData?.slots || []

  return (
    <div className="space-y-6">
      {/* Network status indicator */}
      {!isOnline && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertTriangle className="w-5 h-5 text-orange-600 mr-2" />
            <span className="text-orange-800 font-medium">İnternet bağlantısı yok</span>
            <span className="text-orange-600 ml-2">Vardiya düzenlemeleri devre dışı</span>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vardiya Planlama</h1>
          <p className="mt-1 text-sm text-gray-500">
            Haftalık vardiya programını yönetin ve düzenleyin
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Week selector */}
          <input
            type="date"
            value={selectedWeek}
            onChange={(e) => setSelectedWeek(e.target.value)}
            className="input text-sm"
          />
          
          {canManageShifts && (
            <>
              <LoadingButton
                onClick={generateShifts}
                loading={isGenerating}
                disabled={!isOnline || isGenerating || !employees?.data?.length}
                variant="primary"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Vardiya Oluştur
              </LoadingButton>
              
              <button 
                className="btn btn-secondary"
                disabled={!isOnline}
              >
                <Download className="w-4 h-4 mr-2" />
                Dışa Aktar
              </button>
            </>
          )}
        </div>
      </div>

      {/* Shift Statistics */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="flex items-center">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Calendar className="h-5 w-5 text-blue-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Toplam Vardiya</p>
              <p className="text-lg font-semibold text-gray-900">
                {shiftsData?.shifts?.length || 0}
              </p>
            </div>
          </div>
        </div>
        
        <div className="card p-4">
          <div className="flex items-center">
            <div className="p-2 bg-green-50 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Aktif</p>
              <p className="text-lg font-semibold text-gray-900">
                {shiftsData?.shifts?.filter(s => s.status === 'ACTIVE').length || 0}
              </p>
            </div>
          </div>
        </div>
        
        <div className="card p-4">
          <div className="flex items-center">
            <div className="p-2 bg-yellow-50 rounded-lg">
              <Clock className="h-5 w-5 text-yellow-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Planlanmış</p>
              <p className="text-lg font-semibold text-gray-900">
                {shiftsData?.shifts?.filter(s => s.status === 'SCHEDULED').length || 0}
              </p>
            </div>
          </div>
        </div>
        
        <div className="card p-4">
          <div className="flex items-center">
            <div className="p-2 bg-purple-50 rounded-lg">
              <User className="h-5 w-5 text-purple-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Çalışan</p>
              <p className="text-lg font-semibold text-gray-900">
                {new Set(shiftsData?.shifts?.map(s => s.employee.id) || []).size || 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Drag and Drop Shift Planner */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-medium text-gray-900">Haftalık Program</h3>
          {draggedShift && (
            <div className="flex items-center text-sm text-blue-600">
              <AlertCircle className="w-4 h-4 mr-1" />
              {draggedShift.employee.user.firstName} {draggedShift.employee.user.lastName} taşınıyor
            </div>
          )}
        </div>

        <DndContext
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="overflow-x-auto">
            <div className="grid grid-cols-8 gap-2 min-w-[800px]">
              {/* Header row */}
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-sm font-medium text-gray-900">Zaman</p>
              </div>
              {weekDays.map(day => (
                <div key={day} className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm font-medium text-gray-900">{day}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(selectedWeek).toLocaleDateString('tr-TR')}
                  </p>
                </div>
              ))}

              {/* Time slots */}
              {slots.map(slot => (
                <div key={slot.code} className="contents">
                  <div className="p-3 bg-gray-50 rounded-lg flex items-center">
                    <Clock className="w-4 h-4 mr-2 text-gray-400" />
                    <span className="text-sm font-medium text-gray-900">{slot.label}</span>
                    <span className="text-xs text-gray-500 ml-2">({slot.timeRange})</span>
                  </div>

                  {weekDays.map((day, dayIndex) => {
                    const dayDate = new Date(selectedWeek)
                    dayDate.setDate(dayDate.getDate() + dayIndex)
                    const dayKey = dayDate.toISOString().split('T')[0]
                    // Use safe droppable ID format: ${dayKey}__${slot.code} to avoid hyphen collisions
                    const dropId = `${dayKey}__${slot.code}`
                    const shiftsInSlot = getShiftsByDayAndSlot(dayKey, slot.code)

                    return (
                      <DroppableSlot key={dropId} id={dropId}>
                        <div className="space-y-2">
                          {shiftsInSlot.map((shift) => (
                            <DraggableShift
                              key={shift.id}
                              shift={shift}
                              disabled={!canManageShifts}
                            />
                          ))}
                        </div>
                      </DroppableSlot>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          <DragOverlay>
            {draggedShift ? (
              <div
                className={`
                  p-2 rounded border text-xs shadow-lg
                  ${getStatusColor(draggedShift.status)}
                `}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1">
                    {getStatusIcon(draggedShift.status)}
                    <span className="font-medium">
                      {draggedShift.employee.user.firstName} {draggedShift.employee.user.lastName}
                    </span>
                  </div>
                </div>
                <div className="text-xs opacity-75 mt-1">
                  {draggedShift.employee.department}
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Generation Results Modal */}
      {showResults && generationResults && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            {/* Background overlay */}
            <div 
              className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
              onClick={() => setShowResults(false)}
            />

            {/* Modal panel */}
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
              {/* Header */}
              <div className="bg-blue-600 px-6 py-4 flex items-center justify-between">
                <h3 className="text-lg font-medium text-white">
                  Vardiya Planı Oluşturuldu
                </h3>
                <button
                  onClick={() => setShowResults(false)}
                  className="text-white hover:text-gray-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="bg-white px-6 py-4 space-y-6">
                {/* Summary */}
                <div className="grid grid-cols-2 gap-4">
                  {generationResults.totalShifts !== undefined && (
                    <div className="bg-blue-50 rounded-lg p-4">
                      <div className="flex items-center">
                        <Calendar className="w-5 h-5 text-blue-600 mr-2" />
                        <div>
                          <p className="text-sm text-gray-600">Toplam Vardiya</p>
                          <p className="text-2xl font-bold text-gray-900">{generationResults.totalShifts}</p>
                        </div>
                      </div>
                    </div>
                  )}
                  {generationResults.employeeCount !== undefined && (
                    <div className="bg-green-50 rounded-lg p-4">
                      <div className="flex items-center">
                        <Users className="w-5 h-5 text-green-600 mr-2" />
                        <div>
                          <p className="text-sm text-gray-600">Çalışan Sayısı</p>
                          <p className="text-2xl font-bold text-gray-900">{generationResults.employeeCount}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Metrics */}
                {generationResults.metrics && (
                  <div className="border-t border-gray-200 pt-4">
                    <h4 className="text-sm font-medium text-gray-900 mb-3 flex items-center">
                      <TrendingUp className="w-4 h-4 mr-2 text-blue-600" />
                      Performans Metrikleri
                    </h4>
                    <div className="grid grid-cols-3 gap-4">
                      {generationResults.metrics.efficiency_score !== undefined && (
                        <div>
                          <p className="text-xs text-gray-500">Verimlilik Skoru</p>
                          <p className="text-lg font-semibold text-gray-900">
                            {(generationResults.metrics.efficiency_score * 100).toFixed(1)}%
                          </p>
                        </div>
                      )}
                      {generationResults.metrics.coverage !== undefined && (
                        <div>
                          <p className="text-xs text-gray-500">Kapsam</p>
                          <p className="text-lg font-semibold text-gray-900">
                            {(generationResults.metrics.coverage * 100).toFixed(1)}%
                          </p>
                        </div>
                      )}
                      {generationResults.metrics.balance_score !== undefined && (
                        <div>
                          <p className="text-xs text-gray-500">Denge Skoru</p>
                          <p className="text-lg font-semibold text-gray-900">
                            {(generationResults.metrics.balance_score * 100).toFixed(1)}%
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Violations */}
                {generationResults.violations && generationResults.violations.length > 0 && (
                  <div className="border-t border-gray-200 pt-4">
                    <h4 className="text-sm font-medium text-gray-900 mb-3 flex items-center">
                      <AlertTriangle className="w-4 h-4 mr-2 text-yellow-600" />
                      Uyarılar ({generationResults.violations.length})
                    </h4>
                    <ul className="space-y-2">
                      {generationResults.violations.map((violation, index) => (
                        <li key={index} className="flex items-start text-sm text-gray-700">
                          <AlertCircle className="w-4 h-4 text-yellow-600 mr-2 mt-0.5 flex-shrink-0" />
                          <span>{violation}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Recommendations */}
                {generationResults.recommendations && generationResults.recommendations.length > 0 && (
                  <div className="border-t border-gray-200 pt-4">
                    <h4 className="text-sm font-medium text-gray-900 mb-3 flex items-center">
                      <Lightbulb className="w-4 h-4 mr-2 text-blue-600" />
                      Öneriler ({generationResults.recommendations.length})
                    </h4>
                    <ul className="space-y-2">
                      {generationResults.recommendations.map((recommendation, index) => (
                        <li key={index} className="flex items-start text-sm text-gray-700">
                          <CheckCircle className="w-4 h-4 text-blue-600 mr-2 mt-0.5 flex-shrink-0" />
                          <span>{recommendation}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="bg-gray-50 px-6 py-4 flex justify-end">
                <button
                  onClick={() => setShowResults(false)}
                  className="btn btn-primary"
                >
                  Tamam
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ShiftsPage() {
  return (
    <ErrorBoundary>
      <RoleGuard requiredRole={UserRole.MESSENGER}>
        <ShiftsPageContent />
      </RoleGuard>
    </ErrorBoundary>
  )
}