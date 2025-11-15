import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/services/api'
import { websocketService } from '@/services/websocketService'
import { useAuthStore } from '@/stores/authStore'
import {
  CheckSquare,
  Plus,
  Filter,
  Calendar,
  User,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  Pause,
  FileText,
  Search,
  X,
  ChevronDown,
  ChevronUp,
  Edit,
  Trash2,
} from 'lucide-react'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { RoleGuard, UserRole, usePermission } from '@/components/guards/RoleGuard'
import { LoadingSpinner, PageLoading } from '@/components/ui/LoadingStates'
import { useToast, useNetworkStatus } from '@/components/ui/Toast'
import type { Task, TaskStatus, TaskPriority, CreateTaskInput, UpdateTaskInput, User as UserType } from '@/types'

const STATUS_COLORS: Record<TaskStatus, string> = {
  OPEN: 'bg-blue-100 text-blue-800',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-800',
  BLOCKED: 'bg-red-100 text-red-800',
  DONE: 'bg-green-100 text-green-800',
}

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  LOW: 'bg-gray-100 text-gray-800',
  NORMAL: 'bg-blue-100 text-blue-800',
  HIGH: 'bg-orange-100 text-orange-800',
  CRITICAL: 'bg-red-100 text-red-800',
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  OPEN: 'Açık',
  IN_PROGRESS: 'Devam Ediyor',
  BLOCKED: 'Engellendi',
  DONE: 'Tamamlandı',
}

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: 'Düşük',
  NORMAL: 'Normal',
  HIGH: 'Yüksek',
  CRITICAL: 'Kritik',
}

interface TaskModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: CreateTaskInput) => Promise<void>
  users: UserType[]
  task?: Task // For edit mode
}

function TaskModal({ isOpen, onClose, onSubmit, users, task }: TaskModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('NORMAL')
  const [dueDate, setDueDate] = useState('')
  const [assigneeIds, setAssigneeIds] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      if (task) {
        // Edit mode
        setTitle(task.title)
        setDescription(task.description || '')
        setPriority(task.priority)
        setDueDate(task.dueDate ? task.dueDate.split('T')[0] : '')
        setAssigneeIds(task.assignees.map((a) => a.id))
      } else {
        // Create mode
        setTitle('')
        setDescription('')
        setPriority('NORMAL')
        setDueDate('')
        setAssigneeIds([])
      }
    }
  }, [isOpen, task])

  const handleAssigneeToggle = (userId: string) => {
    setAssigneeIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || assigneeIds.length === 0) return

    setIsSubmitting(true)
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        dueDate: dueDate || undefined,
        assigneeIds,
      })
      onClose()
    } catch (error) {
      // Error handled by parent
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">
            {task ? 'Görevi Düzenle' : 'Yeni Görev Oluştur'}
          </h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Başlık <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              maxLength={150}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Açıklama
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={4}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Öncelik
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Bitiş Tarihi
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Atanacak Kişiler <span className="text-red-500">*</span>
            </label>
            <div className="border border-gray-300 rounded-md p-3 max-h-48 overflow-y-auto">
              {users.length === 0 ? (
                <p className="text-sm text-gray-500">Kullanıcı bulunamadı</p>
              ) : (
                users.map((user) => (
                  <label
                    key={user.id}
                    className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={assigneeIds.includes(user.id)}
                      onChange={() => handleAssigneeToggle(user.id)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">
                      {user.firstName} {user.lastName} ({user.email})
                    </span>
                  </label>
                ))
              )}
            </div>
            {assigneeIds.length > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                {assigneeIds.length} kişi seçildi
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !title.trim() || assigneeIds.length === 0}
              className="px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting
                ? task
                  ? 'Güncelleniyor...'
                  : 'Oluşturuluyor...'
                : task
                ? 'Güncelle'
                : 'Oluştur'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface StatusUpdateModalProps {
  isOpen: boolean
  onClose: () => void
  task: Task
  onSubmit: (status: TaskStatus, completionNote?: string) => Promise<void>
}

function StatusUpdateModal({ isOpen, onClose, task, onSubmit }: StatusUpdateModalProps) {
  const [status, setStatus] = useState<TaskStatus>(task.status)
  const [completionNote, setCompletionNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setStatus(task.status)
      setCompletionNote('')
    }
  }, [isOpen, task.status])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      await onSubmit(status, completionNote.trim() || undefined)
      onClose()
    } catch (error) {
      // Error handled by parent
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  const validNextStatuses: TaskStatus[] =
    task.status === 'OPEN'
      ? ['IN_PROGRESS', 'BLOCKED']
      : task.status === 'IN_PROGRESS'
      ? ['BLOCKED', 'DONE']
      : task.status === 'BLOCKED'
      ? ['IN_PROGRESS', 'DONE']
      : []

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">Görev Durumunu Güncelle</h2>
          <p className="text-sm text-gray-600 mt-1">{task.title}</p>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Durum
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {validNextStatuses.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>

          {status === 'DONE' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tamamlanma Notu (Opsiyonel)
              </label>
              <textarea
                value={completionNote}
                onChange={(e) => setCompletionNote(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={4}
                maxLength={500}
                placeholder="Görevin tamamlanması hakkında not ekleyebilirsiniz..."
              />
              <p className="text-xs text-gray-500 mt-1">
                Bu not sadece görevi atayan kişi, siz ve Başkan tarafından görülebilir.
              </p>
              <p className="text-xs text-gray-500">
                {completionNote.length}/500 karakter
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Güncelleniyor...' : 'Güncelle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Memoize TaskCard to prevent unnecessary re-renders
const TaskCard = React.memo(function TaskCard({
  task,
  onStatusUpdate,
  onEdit,
  onDelete,
}: {
  task: Task
  onStatusUpdate: (task: Task) => void
  onEdit?: (task: Task) => void
  onDelete?: (task: Task) => void
}) {
  const { user } = useAuthStore()
  const { hasRole } = usePermission()
  const [expanded, setExpanded] = useState(false)
  const isAssignee = task.assignees.some((a) => a.id === user?.id)
  const isAssigner = task.assignerId === user?.id
  const isPresident = hasRole(UserRole.PRESIDENT)
  const canEdit = isAssigner
  const canDelete = isPresident
  const canViewNote =
    task.assignerId === user?.id ||
    isAssignee ||
    user?.role === 'PRESIDENT'

  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'DONE'

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-lg font-semibold text-gray-900">{task.title}</h3>
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${PRIORITY_COLORS[task.priority]}`}>
              {PRIORITY_LABELS[task.priority]}
            </span>
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${STATUS_COLORS[task.status]}`}>
              {STATUS_LABELS[task.status]}
            </span>
          </div>

          {task.description && (
            <p className="text-sm text-gray-600 mb-2 line-clamp-2">{task.description}</p>
          )}

          <div className="flex items-center gap-4 text-sm text-gray-500">
            <div className="flex items-center gap-1">
              <User className="w-4 h-4" />
              <span>
                {task.assigner.firstName} {task.assigner.lastName} →{' '}
                {task.assignees.map((a) => `${a.firstName} ${a.lastName}`).join(', ')}
              </span>
            </div>
            {task.dueDate && (
              <div className={`flex items-center gap-1 ${isOverdue ? 'text-red-600 font-medium' : ''}`}>
                <Calendar className="w-4 h-4" />
                <span>{new Date(task.dueDate).toLocaleDateString('tr-TR')}</span>
                {isOverdue && <AlertCircle className="w-4 h-4" />}
              </div>
            )}
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              <span>{new Date(task.createdAt).toLocaleDateString('tr-TR')}</span>
            </div>
          </div>

          {expanded && (
            <div className="mt-4 pt-4 border-t border-gray-200 space-y-2">
              {task.description && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Açıklama:</p>
                  <p className="text-sm text-gray-600">{task.description}</p>
                </div>
              )}
              {task.completionNote && canViewNote && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Tamamlanma Notu:</p>
                  <p className="text-sm text-gray-600">{task.completionNote}</p>
                </div>
              )}
              {task.completedAt && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Tamamlanma Tarihi:</p>
                  <p className="text-sm text-gray-600">
                    {new Date(task.completedAt).toLocaleString('tr-TR')}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isAssignee && task.status !== 'DONE' && (
            <button
              onClick={() => onStatusUpdate(task)}
              className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Durum Güncelle
            </button>
          )}
          {canEdit && onEdit && (
            <button
              onClick={() => onEdit(task)}
              className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-md"
              title="Düzenle"
            >
              <Edit className="w-4 h-4" />
            </button>
          )}
          {canDelete && onDelete && (
            <button
              onClick={() => onDelete(task)}
              className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-md"
              title="Sil"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 text-gray-400 hover:text-gray-600"
          >
            {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>
  )
}, (prevProps, nextProps) => {
  // Custom comparison: only re-render if task data or callback references change
  // Return true if props are equal (skip re-render), false if different (re-render)
  
  // Quick reference check first
  if (prevProps.task === nextProps.task &&
      prevProps.onStatusUpdate === nextProps.onStatusUpdate &&
      prevProps.onEdit === nextProps.onEdit &&
      prevProps.onDelete === nextProps.onDelete) {
    return true // Skip re-render
  }
  
  // Deep comparison for task properties
  const taskEqual = 
    prevProps.task.id === nextProps.task.id &&
    prevProps.task.status === nextProps.task.status &&
    prevProps.task.priority === nextProps.task.priority &&
    prevProps.task.title === nextProps.task.title &&
    prevProps.task.description === nextProps.task.description &&
    prevProps.task.completionNote === nextProps.task.completionNote &&
    prevProps.task.dueDate === nextProps.task.dueDate &&
    prevProps.task.completedAt === nextProps.task.completedAt &&
    prevProps.task.assignerId === nextProps.task.assignerId &&
    prevProps.task.assignees.length === nextProps.task.assignees.length &&
    prevProps.task.assignees.every((a, i) => a.id === nextProps.task.assignees[i]?.id)
  
  const callbacksEqual = 
    prevProps.onStatusUpdate === nextProps.onStatusUpdate &&
    prevProps.onEdit === nextProps.onEdit &&
    prevProps.onDelete === nextProps.onDelete
  
  return taskEqual && callbacksEqual // Return true to skip re-render if equal
})

function TasksPageContent() {
  const [activeTab, setActiveTab] = useState<'assigned-by' | 'assigned-to' | 'all'>('assigned-to')
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all')
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | 'all'>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null)

  const { user } = useAuthStore()
  const { hasRole } = usePermission()
  const queryClient = useQueryClient()
  const toast = useToast()
  const { isOnline } = useNetworkStatus()

  const isPresident = hasRole(UserRole.PRESIDENT)
  const canAssignTasks = hasRole(UserRole.SUPERVISOR)

  // Fetch users for task assignment
  const { data: usersResponse } = useQuery({
    queryKey: ['users'],
    queryFn: () => apiClient.get<{ success: boolean; data: any[] }>('/api/employees'),
    enabled: canAssignTasks,
    retry: 2,
  })

  const users = usersResponse?.data?.map((emp: any) => emp.user).filter((u: UserType) => u.id !== user?.id) || []

  // Fetch tasks based on active tab - optimized queries
  const { data: tasksAssignedBy, isLoading: loadingAssignedBy } = useQuery({
    queryKey: ['tasks', 'assigned-by', statusFilter, priorityFilter],
    queryFn: async () => {
      try {
        return await apiClient.getTasksAssignedBy({
          status: statusFilter !== 'all' ? statusFilter : undefined,
          priority: priorityFilter !== 'all' ? priorityFilter : undefined,
        })
      } catch (err: any) {
        if (err?.code === 'ECONNREFUSED' || !err?.response) {
          throw new Error('Sunucuya bağlanılamıyor')
        }
        throw err
      }
    },
    enabled: (activeTab === 'assigned-by' || (isPresident && activeTab === 'all')) && isOnline,
    refetchOnWindowFocus: false,
    staleTime: 30000, // Consider data fresh for 30 seconds
    retry: (failureCount, error: any) => {
      if (error?.message?.includes('Sunucuya bağlanılamıyor') || !error?.response) {
        return false
      }
      return failureCount < 2
    },
  })

  const { data: tasksAssignedTo, isLoading: loadingAssignedTo } = useQuery({
    queryKey: ['tasks', 'assigned-to', statusFilter, priorityFilter],
    queryFn: async () => {
      try {
        return await apiClient.getTasksAssignedTo({
          status: statusFilter !== 'all' ? statusFilter : undefined,
          priority: priorityFilter !== 'all' ? priorityFilter : undefined,
        })
      } catch (err: any) {
        if (err?.code === 'ECONNREFUSED' || !err?.response) {
          throw new Error('Sunucuya bağlanılamıyor')
        }
        throw err
      }
    },
    enabled: (activeTab === 'assigned-to' || (isPresident && activeTab === 'all')) && isOnline,
    refetchOnWindowFocus: false,
    staleTime: 30000,
    retry: (failureCount, error: any) => {
      if (error?.message?.includes('Sunucuya bağlanılamıyor') || !error?.response) {
        return false
      }
      return failureCount < 2
    },
  })

  const { data: allTasksResponse, isLoading: loadingAll } = useQuery({
    queryKey: ['tasks', 'all', statusFilter, priorityFilter],
    queryFn: async () => {
      try {
        return await apiClient.getAllTasks({
          status: statusFilter !== 'all' ? statusFilter : undefined,
          priority: priorityFilter !== 'all' ? priorityFilter : undefined,
        })
      } catch (err: any) {
        if (err?.code === 'ECONNREFUSED' || !err?.response) {
          throw new Error('Sunucuya bağlanılamıyor')
        }
        throw err
      }
    },
    enabled: isPresident && activeTab === 'all' && isOnline,
    refetchOnWindowFocus: false,
    staleTime: 30000,
    retry: (failureCount, error: any) => {
      if (error?.message?.includes('Sunucuya bağlanılamıyor') || !error?.response) {
        return false
      }
      return failureCount < 2
    },
  })

  const allTasks = allTasksResponse?.data || []

  // Determine which tasks to display
  const tasks =
    activeTab === 'assigned-by'
      ? tasksAssignedBy?.data || []
      : activeTab === 'assigned-to'
      ? tasksAssignedTo?.data || []
      : allTasks

  const isLoading = loadingAssignedBy || loadingAssignedTo || loadingAll

  // Memoize filtered tasks to avoid recalculation on every render
  const filteredTasks = useMemo(() => {
    if (!searchTerm) return tasks
    const searchLower = searchTerm.toLowerCase()
    return tasks.filter((task: Task) => {
      const assigneeNames = task.assignees
        .map((a) => `${a.firstName} ${a.lastName}`)
        .join(' ')
        .toLowerCase()
      return (
        task.title.toLowerCase().includes(searchLower) ||
        task.description?.toLowerCase().includes(searchLower) ||
        `${task.assigner.firstName} ${task.assigner.lastName}`.toLowerCase().includes(searchLower) ||
        assigneeNames.includes(searchLower)
      )
    })
  }, [tasks, searchTerm])

  // WebSocket subscription
  useEffect(() => {
    if (!isOnline) return

    const handleTaskCreated = (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast.success('Yeni görev oluşturuldu', data.task.title)
    }

    const handleTaskUpdated = (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast.info('Görev güncellendi', data.task.title)
    }

    const handleTaskCompleted = (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast.success('Görev tamamlandı', data.task.title)
    }

    const handleTaskDeleted = (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast.info('Görev silindi', data.taskId)
    }

    websocketService.on('task:created', handleTaskCreated)
    websocketService.on('task:updated', handleTaskUpdated)
    websocketService.on('task:completed', handleTaskCompleted)
    websocketService.on('task:deleted', handleTaskDeleted)

    websocketService.emit('task:subscribe')

    return () => {
      websocketService.off('task:created', handleTaskCreated)
      websocketService.off('task:updated', handleTaskUpdated)
      websocketService.off('task:completed', handleTaskCompleted)
      websocketService.off('task:deleted', handleTaskDeleted)
      websocketService.emit('task:unsubscribe')
    }
  }, [isOnline, queryClient, toast])

  // Create task mutation
  const createTaskMutation = useMutation({
    mutationFn: (data: CreateTaskInput) => apiClient.createTask(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast.success('Görev başarıyla oluşturuldu')
      setShowCreateModal(false)
    },
    onError: (error: any) => {
      toast.error('Görev oluşturulamadı', error.response?.data?.error || error.message)
    },
  })

  // Update task mutation
  const updateTaskMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTaskInput }) =>
      apiClient.updateTask(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast.success('Görev başarıyla güncellendi')
      setShowEditModal(false)
      setSelectedTask(null)
    },
    onError: (error: any) => {
      toast.error('Görev güncellenemedi', error.response?.data?.error || error.message)
    },
  })

  // Delete task mutation
  const deleteTaskMutation = useMutation({
    mutationFn: (id: string) => apiClient.deleteTask(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast.success('Görev başarıyla silindi')
      setShowDeleteModal(false)
      setTaskToDelete(null)
    },
    onError: (error: any) => {
      toast.error('Görev silinemedi', error.response?.data?.error || error.message)
    },
  })

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status, completionNote }: { id: string; status: TaskStatus; completionNote?: string }) =>
      apiClient.updateTaskStatus(id, { status, completionNote }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast.success('Görev durumu güncellendi')
      setShowStatusModal(false)
      setSelectedTask(null)
    },
    onError: (error: any) => {
      toast.error('Durum güncellenemedi', error.response?.data?.error || error.message)
    },
  })

  const handleCreateTask = useCallback(async (data: CreateTaskInput) => {
    await createTaskMutation.mutateAsync(data)
  }, [createTaskMutation])

  const handleEditTask = useCallback((task: Task) => {
    setSelectedTask(task)
    setShowEditModal(true)
  }, [])

  const handleUpdateTask = useCallback(async (data: CreateTaskInput) => {
    if (!selectedTask) return
    await updateTaskMutation.mutateAsync({
      id: selectedTask.id,
      data: data as UpdateTaskInput,
    })
  }, [selectedTask, updateTaskMutation])

  const handleDeleteTask = useCallback((task: Task) => {
    setTaskToDelete(task)
    setShowDeleteModal(true)
  }, [])

  const handleConfirmDelete = useCallback(async () => {
    if (!taskToDelete) return
    await deleteTaskMutation.mutateAsync(taskToDelete.id)
  }, [taskToDelete, deleteTaskMutation])

  const handleStatusUpdate = useCallback((task: Task) => {
    setSelectedTask(task)
    setShowStatusModal(true)
  }, [])

  const handleStatusSubmit = useCallback(async (status: TaskStatus, completionNote?: string) => {
    if (!selectedTask) return
    await updateStatusMutation.mutateAsync({
      id: selectedTask.id,
      status,
      completionNote,
    })
  }, [selectedTask, updateStatusMutation])

  // Memoize tasks grouped by status
  const tasksByStatus = useMemo(() => ({
    OPEN: filteredTasks.filter((t: Task) => t.status === 'OPEN'),
    IN_PROGRESS: filteredTasks.filter((t: Task) => t.status === 'IN_PROGRESS'),
    BLOCKED: filteredTasks.filter((t: Task) => t.status === 'BLOCKED'),
    DONE: filteredTasks.filter((t: Task) => t.status === 'DONE'),
  }), [filteredTasks])

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <CheckSquare className="w-8 h-8" />
              Görevler
            </h1>
            <p className="text-gray-600 mt-1">Görev atama ve takip sistemi</p>
          </div>
          {canAssignTasks && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              <Plus className="w-5 h-5" />
              Yeni Görev
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-md mb-6">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              <button
                onClick={() => setActiveTab('assigned-to')}
                className={`px-6 py-4 text-sm font-medium border-b-2 ${
                  activeTab === 'assigned-to'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Bana Atanan Görevler ({tasksAssignedTo?.data?.length || 0})
              </button>
              {canAssignTasks && (
                <button
                  onClick={() => setActiveTab('assigned-by')}
                  className={`px-6 py-4 text-sm font-medium border-b-2 ${
                    activeTab === 'assigned-by'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Oluşturduğum Görevler ({tasksAssignedBy?.data?.length || 0})
                </button>
              )}
              {isPresident && (
                <button
                  onClick={() => setActiveTab('all')}
                  className={`px-6 py-4 text-sm font-medium border-b-2 ${
                    activeTab === 'all'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Tüm Görevler ({allTasks.length})
                </button>
              )}
            </nav>
          </div>

          {/* Filters */}
          <div className="p-4 border-b border-gray-200 flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Görev ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as TaskStatus | 'all')}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Tüm Durumlar</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as TaskPriority | 'all')}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Tüm Öncelikler</option>
              {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Tasks List */}
        {isLoading ? (
          <PageLoading />
        ) : filteredTasks.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <CheckSquare className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 text-lg">Görev bulunamadı</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredTasks.map((task: Task) => (
              <TaskCard
                key={task.id}
                task={task}
                onStatusUpdate={handleStatusUpdate}
                onEdit={canAssignTasks || isPresident ? handleEditTask : undefined}
                onDelete={isPresident ? handleDeleteTask : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <TaskModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateTask}
        users={users}
      />

      <TaskModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false)
          setSelectedTask(null)
        }}
        onSubmit={handleUpdateTask}
        users={users}
        task={selectedTask || undefined}
      />

      {selectedTask && (
        <StatusUpdateModal
          isOpen={showStatusModal}
          onClose={() => {
            setShowStatusModal(false)
            setSelectedTask(null)
          }}
          task={selectedTask}
          onSubmit={handleStatusSubmit}
        />
      )}

      {/* Delete Confirmation Modal */}
      {taskToDelete && (
        <div
          className={`fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 ${
            showDeleteModal ? '' : 'hidden'
          }`}
        >
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">Görevi Sil</h2>
            </div>
            <div className="p-6">
              <p className="text-gray-700 mb-4">
                "{taskToDelete.title}" görevini silmek istediğinizden emin misiniz? Bu işlem
                geri alınamaz.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowDeleteModal(false)
                    setTaskToDelete(null)
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  İptal
                </button>
                <button
                  onClick={handleConfirmDelete}
                  disabled={deleteTaskMutation.isPending}
                  className="px-4 py-2 text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleteTaskMutation.isPending ? 'Siliniyor...' : 'Sil'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function TasksPage() {
  return (
    <ErrorBoundary>
      <TasksPageContent />
    </ErrorBoundary>
  )
}

