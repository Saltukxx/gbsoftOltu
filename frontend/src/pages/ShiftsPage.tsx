import React, { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd'
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
  Lightbulb,
  Grid3x3,
  CalendarDays,
  List,
  BarChart3
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

interface EmployeeBreakdown {
  id: string
  name: string
  shiftCount: number
  totalHours: number
  slots: {
    morning: number
    afternoon: number
    night: number
  }
  weekendShifts: number
  violations: string[]
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
  employeeBreakdown?: EmployeeBreakdown[]
}

type ViewType = 'weekly' | 'monthly' | 'daily' | 'employee' | 'timeline'

function ShiftsPageContent() {
  const [selectedWeek, setSelectedWeek] = useState(() => {
    const today = new Date()
    const monday = new Date(today.setDate(today.getDate() - today.getDay() + 1))
    return monday.toISOString().split('T')[0]
  })
  const [selectedDate, setSelectedDate] = useState(() => {
    return new Date().toISOString().split('T')[0]
  })
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null)
  const [viewType, setViewType] = useState<ViewType>('weekly')
  const [isGenerating, setIsGenerating] = useState(false)
  const [draggedShift, setDraggedShift] = useState<Shift | null>(null)
  const [generationResults, setGenerationResults] = useState<GenerationResults | null>(null)
  const [showResults, setShowResults] = useState(false)
  
  // Filter states
  const [filterDepartment, setFilterDepartment] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterEmployeeName, setFilterEmployeeName] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState<string>('')
  
  const { hasRole } = usePermission()
  const canManageShifts = hasRole(UserRole.SUPERVISOR)
  const canViewAll = hasRole(UserRole.OPERATOR)
  const queryClient = useQueryClient()
  const toast = useToast()
  const { isOnline } = useNetworkStatus()

  // Fetch shifts and employees data
  // For workload calculations, we need last 4 weeks of data
  const { data: shiftsResponse, isLoading, error } = useQuery({
    queryKey: ['shifts', selectedWeek],
    queryFn: async () => {
      try {
        // Calculate date range: current week + 3 weeks back for workload metrics
        const weekStart = new Date(selectedWeek)
        const fourWeeksAgo = new Date(weekStart)
        fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 21) // 3 weeks back
        
        // Fetch current week data
        const currentWeekData = await apiClient.get<{ success: boolean; data: ShiftPlannerData }>(`/api/shifts?week=${selectedWeek}`)
        
        // Fetch historical data for workload calculations (if not current week)
        let historicalShifts: Shift[] = []
        if (fourWeeksAgo < weekStart) {
          try {
            // Fetch shifts from 4 weeks ago to current week start
            const historicalResponse = await apiClient.get<{ success: boolean; data: ShiftPlannerData }>(
              `/api/shifts?startDate=${fourWeeksAgo.toISOString().split('T')[0]}&endDate=${weekStart.toISOString().split('T')[0]}`
            )
            historicalShifts = historicalResponse.data?.data?.shifts || []
          } catch (histErr) {
            // If historical endpoint doesn't exist or fails, fall back to current week only
            console.warn('Historical shifts not available, using current week only for workload calculations', histErr)
          }
        }
        
        // Merge historical shifts with current week shifts (avoid duplicates by ID)
        const currentShiftIds = new Set(currentWeekData.data.data.shifts.map(s => s.id))
        const uniqueHistoricalShifts = historicalShifts.filter(hs => !currentShiftIds.has(hs.id))
        const allShifts = [...uniqueHistoricalShifts, ...currentWeekData.data.data.shifts]
        
        return {
          ...currentWeekData,
          data: {
            ...currentWeekData.data.data,
            shifts: allShifts
          }
        }
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
          employeeCount: response.data.metadata?.employeeCount,
          employeeBreakdown: response.data.data.employeeBreakdown
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

  // Validate if shift can be dropped at destination
  const validateDrop = useCallback((shift: Shift | null, destDay: string, destSlot: string): { valid: boolean; reason?: string } => {
    if (!shift) return { valid: false, reason: 'Vardiya bulunamadı' }
    
    // Check if employee is available for this slot/day
    const employee = shift.employee
    const dayDate = new Date(destDay)
    const dayName = dayDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()
    
    // Check availability
    const availability = employee.availability || {}
    const dayAvailability = availability[dayName] || []
    if (!dayAvailability.includes(destSlot.toLowerCase())) {
      return { valid: false, reason: 'Çalışan bu gün/saatte müsait değil' }
    }
    
    // Check minimum rest hours (12 hours between shifts)
    const currentShifts = filteredShifts().filter(s => 
      s.employee.id === employee.id && s.id !== shift.id
    )
    
    for (const existingShift of currentShifts) {
      const existingDate = new Date(existingShift.day)
      const newDate = new Date(destDay)
      const hoursDiff = Math.abs(newDate.getTime() - existingDate.getTime()) / (1000 * 60 * 60)
      
      if (hoursDiff < 12 && hoursDiff > 0) {
        return { valid: false, reason: 'Minimum 12 saat dinlenme süresi gerekli' }
      }
    }
    
    return { valid: true }
  }, [filteredShifts])

  // Track drag over state for validation feedback
  const [dragOverState, setDragOverState] = useState<{ [key: string]: { valid: boolean; reason?: string } }>({})

  // Drag and drop handling
  const onDragStart = (start: any) => {
    const shift = filteredShifts().find(s => s.id === start.draggableId)
    setDraggedShift(shift || null)
    setDragOverState({})
  }

  const onDragUpdate = (update: any) => {
    if (!draggedShift || !update.destination) {
      setDragOverState({})
      return
    }
    
    const [destDay, destSlot] = update.destination.droppableId.split('__')
    const validation = validateDrop(draggedShift, destDay, destSlot)
    
    setDragOverState({
      [update.destination.droppableId]: validation
    })
  }

  const onDragEnd = (result: DropResult) => {
    setDragOverState({})
    
    if (!result.destination || !canManageShifts || !isOnline) {
      if (!isOnline) {
        toast.warning('Offline modda değişiklik yapılamaz', 'Bağlantınızı kontrol edin')
      }
      setDraggedShift(null)
      return
    }

    const { source, destination, draggableId } = result
    
    // Don't update if dropped in the same position
    if (source.droppableId === destination.droppableId && source.index === destination.index) {
      setDraggedShift(null)
      return
    }

    // Parse destination slot info - format: ${dayKey}__${slot.code}
    const [destDay, destSlot] = destination.droppableId.split('__')
    const shift = filteredShifts().find(s => s.id === draggableId)
    
    if (!shift || !destDay || !destSlot) {
      toast.error('Geçersiz hedef konum', 'Lütfen tekrar deneyin')
      setDraggedShift(null)
      return
    }

    // Validate slot is a valid ShiftSlot
    const validSlots: ShiftSlot[] = ['MORNING', 'AFTERNOON', 'NIGHT']
    if (!validSlots.includes(destSlot as ShiftSlot)) {
      toast.error('Geçersiz vardiya saati', 'Lütfen geçerli bir saat seçin')
      setDraggedShift(null)
      return
    }

    // Validate drop with constraints
    const validation = validateDrop(shift, destDay, destSlot)
    if (!validation.valid) {
      toast.error('Vardiya taşınamadı', validation.reason || 'Kısıtlamalar ihlal edildi')
      setDraggedShift(null)
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
    
    setDraggedShift(null)
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

  // Filter shifts based on active filters
  const filteredShifts = useCallback(() => {
    if (!shiftsData?.shifts) return []
    
    return shiftsData.shifts.filter(shift => {
      // Department filter
      if (filterDepartment && shift.employee.department !== filterDepartment) {
        return false
      }
      
      // Status filter
      if (filterStatus && shift.status !== filterStatus) {
        return false
      }
      
      // Employee name filter
      if (filterEmployeeName) {
        const fullName = `${shift.employee.user.firstName} ${shift.employee.user.lastName}`.toLowerCase()
        if (!fullName.includes(filterEmployeeName.toLowerCase())) {
          return false
        }
      }
      
      // Search query (searches in employee name, department, notes)
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const fullName = `${shift.employee.user.firstName} ${shift.employee.user.lastName}`.toLowerCase()
        const department = shift.employee.department?.toLowerCase() || ''
        const notes = (shift.notes || '').toLowerCase()
        
        if (!fullName.includes(query) && !department.includes(query) && !notes.includes(query)) {
          return false
        }
      }
      
      return true
    })
  }, [shiftsData?.shifts, filterDepartment, filterStatus, filterEmployeeName, searchQuery])

  // Memoize shift filtering function (now uses filtered shifts)
  const getShiftsByDayAndSlot = useCallback((day: string, slotCode: string) => {
    return filteredShifts().filter(shift => 
      shift.day === day && shift.slot === slotCode
    )
  }, [filteredShifts])

  // Calculate employee workload metrics
  const calculateEmployeeWorkload = useCallback((employeeId: string) => {
    if (!shiftsData?.shifts) return { hours: 0, consecutiveDays: 0, weekendShifts: 0 }
    
    const weekStart = new Date(selectedWeek)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)
    
    // Filter shifts for this specific employee
    const allEmployeeShifts = shiftsData.shifts.filter(s => s.employee.id === employeeId)
    
    // Calculate hours worked THIS WEEK only (for progress bar)
    const thisWeekShifts = allEmployeeShifts.filter(s => {
      const shiftDate = new Date(s.day)
      return shiftDate >= weekStart && shiftDate <= weekEnd
    })
    const hours = thisWeekShifts.length * 8 // Assuming 8-hour shifts
    
    // Calculate consecutive days (using THIS WEEK's shifts)
    const shiftDays = [...new Set(thisWeekShifts.map(s => s.day))].sort()
    let maxConsecutive = 0
    let currentConsecutive = 0
    let lastDate: Date | null = null
    
    shiftDays.forEach(dayStr => {
      const day = new Date(dayStr)
      if (lastDate) {
        const diffDays = Math.floor((day.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24))
        if (diffDays === 1) {
          currentConsecutive++
        } else {
          maxConsecutive = Math.max(maxConsecutive, currentConsecutive)
          currentConsecutive = 1
        }
      } else {
        currentConsecutive = 1
      }
      lastDate = day
    })
    maxConsecutive = Math.max(maxConsecutive, currentConsecutive)
    
    // Calculate weekend shifts (last 4 weeks) - use ALL shifts for this calculation
    const fourWeeksAgo = new Date(weekStart)
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28)
    const weekendShifts = allEmployeeShifts.filter(s => {
      const day = new Date(s.day)
      const dayOfWeek = day.getDay()
      return (dayOfWeek === 0 || dayOfWeek === 6) && day >= fourWeeksAgo && day < weekStart
    }).length
    
    return { hours, consecutiveDays: maxConsecutive, weekendShifts }
  }, [shiftsData?.shifts, selectedWeek])

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
        
        <div className="flex items-center gap-3 flex-wrap">
          {/* View type selector */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewType('weekly')}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                viewType === 'weekly'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              title="Haftalık Görünüm"
            >
              <Grid3x3 className="w-4 h-4 inline mr-1" />
              Haftalık
            </button>
            <button
              onClick={() => setViewType('monthly')}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                viewType === 'monthly'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              title="Aylık Görünüm"
            >
              <CalendarDays className="w-4 h-4 inline mr-1" />
              Aylık
            </button>
            <button
              onClick={() => setViewType('daily')}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                viewType === 'daily'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              title="Günlük Detaylı Görünüm"
            >
              <Calendar className="w-4 h-4 inline mr-1" />
              Günlük
            </button>
            <button
              onClick={() => setViewType('employee')}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                viewType === 'employee'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              title="Çalışan Odaklı Görünüm"
            >
              <User className="w-4 h-4 inline mr-1" />
              Çalışan
            </button>
            <button
              onClick={() => setViewType('timeline')}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                viewType === 'timeline'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              title="Zaman Çizelgesi Görünümü"
            >
              <BarChart3 className="w-4 h-4 inline mr-1" />
              Zaman Çizelgesi
            </button>
          </div>

          {/* Date selector - changes based on view type */}
          {viewType === 'weekly' && (
            <input
              type="date"
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(e.target.value)}
              className="input text-sm"
            />
          )}
          {viewType === 'monthly' && (
            <input
              type="month"
              value={selectedWeek.substring(0, 7)}
              onChange={(e) => {
                const monthStart = new Date(e.target.value + '-01')
                setSelectedWeek(monthStart.toISOString().split('T')[0])
              }}
              className="input text-sm"
            />
          )}
          {viewType === 'daily' && (
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="input text-sm"
            />
          )}
          {viewType === 'employee' && shiftsData?.employees && (
            <select
              value={selectedEmployee || ''}
              onChange={(e) => setSelectedEmployee(e.target.value || null)}
              className="input text-sm"
            >
              <option value="">Tüm Çalışanlar</option>
              {shiftsData.employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.user?.firstName} {emp.user?.lastName}
                </option>
              ))}
            </select>
          )}
          
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

      {/* Filters Section */}
      <div className="card p-4">
        <div className="flex flex-col md:flex-row gap-3 flex-wrap">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Ara (çalışan, departman, notlar)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input pl-10 w-full"
              />
            </div>
          </div>
          
          {/* Department Filter */}
          <div className="min-w-[150px]">
            <select
              value={filterDepartment}
              onChange={(e) => setFilterDepartment(e.target.value)}
              className="input w-full"
            >
              <option value="">Tüm Departmanlar</option>
              {[...new Set(shiftsData?.shifts?.map(s => s.employee.department).filter(Boolean))].map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>
          
          {/* Status Filter */}
          <div className="min-w-[150px]">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="input w-full"
            >
              <option value="">Tüm Durumlar</option>
              <option value="SCHEDULED">Planlanmış</option>
              <option value="ACTIVE">Aktif</option>
              <option value="COMPLETED">Tamamlanmış</option>
            </select>
          </div>
          
          {/* Employee Name Filter */}
          <div className="min-w-[150px]">
            <input
              type="text"
              placeholder="Çalışan ismi..."
              value={filterEmployeeName}
              onChange={(e) => setFilterEmployeeName(e.target.value)}
              className="input w-full"
            />
          </div>
          
          {/* Clear Filters */}
          {(filterDepartment || filterStatus || filterEmployeeName || searchQuery) && (
            <button
              onClick={() => {
                setFilterDepartment('')
                setFilterStatus('')
                setFilterEmployeeName('')
                setSearchQuery('')
              }}
              className="btn btn-secondary whitespace-nowrap"
            >
              <X className="w-4 h-4 mr-1" />
              Filtreleri Temizle
            </button>
          )}
        </div>
        
        {/* Active filters count */}
        {(filterDepartment || filterStatus || filterEmployeeName || searchQuery) && (
          <div className="mt-2 text-sm text-gray-600">
            {filteredShifts().length} vardiya gösteriliyor (toplam {shiftsData?.shifts?.length || 0})
          </div>
        )}
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
                {filteredShifts().length || shiftsData?.shifts?.length || 0}
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
                {filteredShifts().filter(s => s.status === 'ACTIVE').length || shiftsData?.shifts?.filter(s => s.status === 'ACTIVE').length || 0}
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
                {filteredShifts().filter(s => s.status === 'SCHEDULED').length || shiftsData?.shifts?.filter(s => s.status === 'SCHEDULED').length || 0}
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
                {new Set(filteredShifts().map(s => s.employee.id) || shiftsData?.shifts?.map(s => s.employee.id) || []).size || 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Employee Workload Indicators */}
      {viewType === 'weekly' && shiftsData?.employees && (
        <div className="card p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-3">Çalışan İş Yükü Göstergeleri</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {shiftsData.employees.slice(0, 6).map((emp) => {
              const workload = calculateEmployeeWorkload(emp.id)
              const maxHours = emp.maxHoursPerWeek || 40
              const hoursPercent = Math.min((workload.hours / maxHours) * 100, 100)
              const isOverworked = workload.hours > maxHours
              const isHighConsecutive = workload.consecutiveDays > 5
              
              return (
                <div key={emp.id} className="border rounded-lg p-3 bg-white">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-900">
                      {emp.user?.firstName} {emp.user?.lastName}
                    </span>
                    {(isOverworked || isHighConsecutive || workload.weekendShifts > 2) && (
                      <AlertTriangle className="w-4 h-4 text-yellow-600" />
                    )}
                  </div>
                  
                  {/* Hours progress bar */}
                  <div className="mb-2">
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>Bu Hafta: {workload.hours}h / {maxHours}h</span>
                      <span className={isOverworked ? 'text-red-600 font-medium' : ''}>
                        {hoursPercent.toFixed(0)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          isOverworked
                            ? 'bg-red-500'
                            : hoursPercent > 80
                            ? 'bg-yellow-500'
                            : 'bg-green-500'
                        }`}
                        style={{ width: `${Math.min(hoursPercent, 100)}%` }}
                      />
                    </div>
                  </div>
                  
                  {/* Consecutive days indicator */}
                  <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                    <span>Ardışık Günler:</span>
                    <span className={isHighConsecutive ? 'text-yellow-600 font-medium' : ''}>
                      {workload.consecutiveDays} gün
                    </span>
                  </div>
                  
                  {/* Weekend shifts indicator */}
                  <div className="flex items-center justify-between text-xs text-gray-600">
                    <span>Son 4 Hafta Hafta Sonu:</span>
                    <span className={workload.weekendShifts > 2 ? 'text-yellow-600 font-medium' : ''}>
                      {workload.weekendShifts} vardiya
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Drag and Drop Shift Planner - Conditional rendering based on view type */}
      {viewType === 'weekly' && (
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

        <DragDropContext onDragStart={onDragStart} onDragUpdate={onDragUpdate} onDragEnd={onDragEnd}>
          {/* Desktop Grid View */}
          <div className="hidden md:block overflow-x-auto">
            <div className="grid grid-cols-8 gap-2 min-w-[800px]">
              {/* Header row */}
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-sm font-medium text-gray-900">Zaman</p>
              </div>
              {weekDays.map((day, dayIndex) => {
                const dayDate = new Date(selectedWeek)
                dayDate.setDate(dayDate.getDate() + dayIndex)
                return (
                  <div key={day} className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm font-medium text-gray-900">{day}</p>
                    <p className="text-xs text-gray-500">
                      {dayDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                )
              })}

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
                      <Droppable key={dropId} droppableId={dropId}>
                        {(provided, snapshot) => {
                          const dragOverValidation = dragOverState[dropId]
                          const isValid = dragOverValidation?.valid !== false
                          const isInvalid = dragOverValidation?.valid === false
                          
                          return (
                          <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className={`
                              min-h-[100px] p-2 rounded-lg border-2 border-dashed transition-colors
                              ${snapshot.isDraggingOver && isValid
                                ? 'border-green-400 bg-green-50' 
                                : snapshot.isDraggingOver && isInvalid
                                ? 'border-red-400 bg-red-50'
                                : snapshot.isDraggingOver
                                ? 'border-blue-300 bg-blue-50'
                                : 'border-gray-200 bg-gray-50'
                              }
                            `}
                            title={isInvalid ? dragOverValidation?.reason : undefined}
                          >
                            <div className="space-y-2">
                              {shiftsInSlot.map((shift, index) => (
                                <Draggable
                                  key={shift.id}
                                  draggableId={shift.id}
                                  index={index}
                                  isDragDisabled={!canManageShifts}
                                >
                                  {(provided, snapshot) => (
                                    <div
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      {...provided.dragHandleProps}
                                      className={`
                                        p-2 rounded border text-xs transition-transform
                                        ${getStatusColor(shift.status)}
                                        ${snapshot.isDragging ? 'rotate-2 shadow-lg' : 'hover:shadow-md'}
                                        ${canManageShifts ? 'cursor-move' : 'cursor-default'}
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
                                      {shift.notes && (
                                        <div className="text-xs text-gray-500 mt-1 italic truncate" title={shift.notes}>
                                          📝 {shift.notes}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </Draggable>
                              ))}
                            </div>
                            {provided.placeholder}
                            {snapshot.isDraggingOver && isInvalid && (
                              <div className="text-xs text-red-600 mt-1 font-medium">
                                {dragOverValidation?.reason}
                              </div>
                            )}
                          </div>
                          )
                        }}
                      </Droppable>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
          
          {/* Mobile List View */}
          <div className="md:hidden space-y-4">
            {weekDays.map((day, dayIndex) => {
              const dayDate = new Date(selectedWeek)
              dayDate.setDate(dayDate.getDate() + dayIndex)
              const dayKey = dayDate.toISOString().split('T')[0]
              
              return (
                <div key={day} className="card p-4">
                  <div className="mb-3 pb-2 border-b">
                    <h4 className="font-medium text-gray-900">{day}</h4>
                    <p className="text-xs text-gray-500">
                      {dayDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                  </div>
                  
                  <div className="space-y-3">
                    {slots.map(slot => {
                      const shiftsInSlot = getShiftsByDayAndSlot(dayKey, slot.code)
                      if (shiftsInSlot.length === 0) return null
                      
                      return (
                        <div key={slot.code} className="border rounded-lg p-3">
                          <div className="flex items-center mb-2">
                            <Clock className="w-4 h-4 text-gray-400 mr-2" />
                            <span className="text-sm font-medium text-gray-900">{slot.label}</span>
                            <span className="text-xs text-gray-500 ml-2">({slot.timeRange})</span>
                          </div>
                          
                          <div className="space-y-2">
                            {shiftsInSlot.map(shift => (
                              <div key={shift.id} className={`p-2 rounded border text-sm ${getStatusColor(shift.status)}`}>
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center space-x-2">
                                    {getStatusIcon(shift.status)}
                                    <span className="font-medium">
                                      {shift.employee.user.firstName} {shift.employee.user.lastName}
                                    </span>
                                  </div>
                                </div>
                                <div className="text-xs text-gray-600 mt-1">
                                  {shift.employee.department}
                                </div>
                                {shift.notes && (
                                  <div className="text-xs text-gray-500 mt-1 italic">
                                    📝 {shift.notes}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  
                  {slots.every(slot => getShiftsByDayAndSlot(dayKey, slot.code).length === 0) && (
                    <div className="text-sm text-gray-500 text-center py-4">
                      Bu gün için vardiya yok
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </DragDropContext>
      </div>
      )}

      {/* Monthly Calendar View */}
      {viewType === 'monthly' && (
        <div className="card p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Aylık Takvim Görünümü</h3>
          <div className="text-center text-gray-500 py-8">
            Aylık görünüm yakında eklenecek
          </div>
        </div>
      )}

      {/* Daily Detailed View */}
      {viewType === 'daily' && (
        <div className="card p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Günlük Detaylı Görünüm - {new Date(selectedDate).toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </h3>
          <div className="space-y-4">
            {slots.map(slot => {
              const dayShifts = shiftsData?.shifts.filter(s => 
                s.day === selectedDate && s.slot === slot.code
              ) || []
              
              return (
                <div key={slot.code} className="border rounded-lg p-4">
                  <div className="flex items-center mb-3">
                    <Clock className="w-5 h-5 text-gray-400 mr-2" />
                    <span className="font-medium text-gray-900">{slot.label}</span>
                    <span className="text-sm text-gray-500 ml-2">({slot.timeRange})</span>
                  </div>
                  {dayShifts.length > 0 ? (
                    <div className="space-y-2">
                      {dayShifts.map(shift => (
                        <div key={shift.id} className={`p-3 rounded border ${getStatusColor(shift.status)}`}>
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-medium">
                                {shift.employee.user.firstName} {shift.employee.user.lastName}
                              </span>
                              <span className="text-xs text-gray-600 ml-2">
                                {shift.employee.department}
                              </span>
                            </div>
                            <span className="text-xs">{getStatusIcon(shift.status)}</span>
                          </div>
                          {shift.notes && (
                            <div className="text-xs text-gray-600 mt-2 italic border-t pt-2">
                              📝 {shift.notes}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 py-2">Bu saatte vardiya yok</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Employee-Centric View */}
      {viewType === 'employee' && (
        <div className="card p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Çalışan Odaklı Görünüm</h3>
          {selectedEmployee ? (
            <div className="space-y-4">
              {shiftsData?.employees
                .filter(emp => emp.id === selectedEmployee)
                .map(emp => {
                  const empShifts = shiftsData?.shifts.filter(s => s.employee.id === emp.id) || []
                  const workload = calculateEmployeeWorkload(emp.id)
                  
                  return (
                    <div key={emp.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h4 className="font-medium text-lg">
                            {emp.user?.firstName} {emp.user?.lastName}
                          </h4>
                          <p className="text-sm text-gray-600">{emp.department}</p>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-gray-600">Toplam Vardiya</div>
                          <div className="text-2xl font-bold">{empShifts.length}</div>
                        </div>
                      </div>
                      
                      {/* Workload indicators */}
                      <div className="grid grid-cols-3 gap-4 mb-4">
                        <div>
                          <div className="text-xs text-gray-600 mb-1">Bu Hafta Saat</div>
                          <div className="text-lg font-semibold">{workload.hours}h</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-600 mb-1">Ardışık Günler</div>
                          <div className="text-lg font-semibold">{workload.consecutiveDays}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-600 mb-1">Hafta Sonu</div>
                          <div className="text-lg font-semibold">{workload.weekendShifts}</div>
                        </div>
                      </div>
                      
                      {/* Shift list */}
                      <div className="space-y-2">
                        {empShifts.length > 0 ? (
                          empShifts.map(shift => (
                            <div key={shift.id} className={`p-2 rounded border text-sm ${getStatusColor(shift.status)}`}>
                              <div className="flex items-center justify-between">
                                <span>{new Date(shift.day).toLocaleDateString('tr-TR')}</span>
                                <span>{slots.find(s => s.code === shift.slot)?.label}</span>
                                {getStatusIcon(shift.status)}
                              </div>
                              {shift.notes && (
                                <div className="text-xs text-gray-600 mt-1 italic">
                                  📝 {shift.notes}
                                </div>
                              )}
                            </div>
                          ))
                        ) : (
                          <div className="text-sm text-gray-500 py-2">Bu çalışan için vardiya yok</div>
                        )}
                      </div>
                    </div>
                  )
                })}
            </div>
          ) : (
            <div className="text-center text-gray-500 py-8">
              Lütfen bir çalışan seçin
            </div>
          )}
        </div>
      )}

      {/* Timeline View */}
      {viewType === 'timeline' && (
        <div className="card p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Zaman Çizelgesi Görünümü</h3>
          <div className="text-center text-gray-500 py-8">
            Zaman çizelgesi görünümü yakında eklenecek
          </div>
        </div>
      )}

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

                {/* Employee Breakdown */}
                {generationResults.employeeBreakdown && generationResults.employeeBreakdown.length > 0 && (
                  <div className="border-t border-gray-200 pt-4">
                    <h4 className="text-sm font-medium text-gray-900 mb-3 flex items-center">
                      <Users className="w-4 h-4 mr-2 text-purple-600" />
                      Çalışan Dağılımı ({generationResults.employeeBreakdown.length} Çalışan)
                    </h4>
                    <div className="overflow-x-auto max-h-96 overflow-y-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Çalışan
                            </th>
                            <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Vardiya
                            </th>
                            <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Saat
                            </th>
                            <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Sabah
                            </th>
                            <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Öğleden Sonra
                            </th>
                            <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Gece
                            </th>
                            <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Hafta Sonu
                            </th>
                            <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Durum
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {generationResults.employeeBreakdown.map((emp) => {
                            const hasViolations = emp.violations && emp.violations.length > 0
                            const isOverworked = emp.totalHours > 40
                            const tooManyWeekends = emp.weekendShifts > 2

                            return (
                              <tr key={emp.id} className={hasViolations ? 'bg-yellow-50' : ''}>
                                <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
                                  {emp.name}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap text-sm text-center text-gray-700">
                                  {emp.shiftCount}
                                </td>
                                <td className={`px-3 py-2 whitespace-nowrap text-sm text-center font-medium ${
                                  isOverworked ? 'text-red-600' : 'text-gray-700'
                                }`}>
                                  {emp.totalHours}h
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap text-sm text-center text-gray-600">
                                  {emp.slots.morning}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap text-sm text-center text-gray-600">
                                  {emp.slots.afternoon}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap text-sm text-center text-gray-600">
                                  {emp.slots.night}
                                </td>
                                <td className={`px-3 py-2 whitespace-nowrap text-sm text-center ${
                                  tooManyWeekends ? 'text-yellow-600 font-medium' : 'text-gray-600'
                                }`}>
                                  {emp.weekendShifts}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap text-center">
                                  {hasViolations ? (
                                    <div className="flex items-center justify-center" title={emp.violations.join(', ')}>
                                      <AlertTriangle className="w-4 h-4 text-yellow-600" />
                                    </div>
                                  ) : (
                                    <div className="flex items-center justify-center">
                                      <CheckCircle className="w-4 h-4 text-green-600" />
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Summary stats */}
                    <div className="mt-3 grid grid-cols-3 gap-3 text-xs text-gray-600">
                      <div className="bg-gray-50 rounded p-2 text-center">
                        <div className="font-medium text-gray-900">
                          {generationResults.employeeBreakdown.reduce((sum, emp) => sum + emp.totalHours, 0)}h
                        </div>
                        <div>Toplam Saat</div>
                      </div>
                      <div className="bg-gray-50 rounded p-2 text-center">
                        <div className="font-medium text-gray-900">
                          {(generationResults.employeeBreakdown.reduce((sum, emp) => sum + emp.totalHours, 0) / generationResults.employeeBreakdown.length).toFixed(1)}h
                        </div>
                        <div>Ortalama Saat/Çalışan</div>
                      </div>
                      <div className="bg-gray-50 rounded p-2 text-center">
                        <div className="font-medium text-red-600">
                          {generationResults.employeeBreakdown.filter(emp => emp.violations && emp.violations.length > 0).length}
                        </div>
                        <div>İhlalli Çalışan</div>
                      </div>
                    </div>
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