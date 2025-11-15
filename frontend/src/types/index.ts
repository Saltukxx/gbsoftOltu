// User types
export type UserRole = 'PRESIDENT' | 'ADMIN' | 'SUPERVISOR' | 'OPERATOR' | 'MESSENGER'

export interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  role: UserRole
  isActive: boolean
  employee?: Employee
}

export interface Employee {
  id: string
  userId: string
  employeeNumber: string
  department: string
  position: string
  skills: string[]
  performanceScore: number
  maxHoursPerWeek: number
  availability: Record<string, string[]>
  isActive: boolean
}

// Auth types
export interface LoginCredentials {
  email: string
  password: string
}

export interface AuthResponse {
  accessToken: string
  refreshToken: string
  user: User
}

// Shift types
export type ShiftSlot = 'MORNING' | 'AFTERNOON' | 'NIGHT'
export type ShiftStatus = 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'

export interface Shift {
  id: string
  employeeId: string
  day: string
  slot: ShiftSlot
  status: ShiftStatus
  efficiencyScore?: number
  notes?: string
  employee: {
    user: {
      firstName: string
      lastName: string
    }
  }
}

export interface ShiftGenerateRequest {
  employees: string[]
  constraints: {
    max_hours_per_week: number
    min_rest_hours: number
    max_consecutive_days: number
  }
  period: {
    start_date: string
    end_date: string
  }
  optimize_for?: string
}

// Vehicle types
export type VehicleType = 'TRUCK' | 'CAR' | 'MOTORCYCLE' | 'HEAVY_MACHINERY' | 'AMBULANCE' | 'FIRE_TRUCK'
export type FuelType = 'GASOLINE' | 'DIESEL' | 'ELECTRIC' | 'HYBRID'

export interface Vehicle {
  id: string
  plateNumber: string
  type: VehicleType
  model: string
  year: number
  fuelType: FuelType
  fuelCapacity: number
  assignedOperatorId?: string
  isActive: boolean
  assignedOperator?: Employee
}

export interface VehicleLocation {
  id: string
  vehicleId: string
  latitude: number
  longitude: number
  speed?: number
  heading?: number
  recordedAt: string
  vehicle?: Vehicle
}

export interface TelemetryData {
  vehicleId: string
  gps: {
    lat: number
    lng: number
    heading?: number
  }
  speed?: number
  fuelLevel?: number
  engineHours?: number
  alerts?: Array<{
    type: string
    message: string
    priority: string
  }>
}

// Message types
export type MessageStatus = 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'

export interface Message {
  id: string
  senderId: string
  receiverId: string
  content?: string
  audioPath?: string
  audioUrl?: string
  duration?: number
  status: MessageStatus
  priority: string
  isRead: boolean
  readAt?: string
  createdAt: string
  timestamp?: string | Date
  readBy?: string[]
  type?: 'TEXT' | 'VOICE'
  sender: {
    id: string
    firstName: string
    lastName: string
    role?: string
  }
  receiver: {
    id: string
    firstName: string
    lastName: string
    role?: string
  }
}

// Dashboard types
export interface DashboardSummary {
  period?: string
  timestamp?: string
  shifts: {
    total: number
    active: number
    completed: number
    averageEfficiency: number
    recent: Shift[]
  }
  vehicles: {
    total: number
    currentlyActive: number
    recentLocations: VehicleLocation[]
  }
  fuel: {
    totalConsumption: number
    averageEfficiency: number
    reports?: Array<{
      id: string
      vehicle: {
        plateNumber: string
        type: VehicleType
      }
      period: string
      consumptionLiters: number
      efficiency?: number
    }>
  }
  messages: {
    unread: number
    recent: Message[]
  }
  alerts: {
    recent: Array<{
      id?: string
      vehicle?: { plateNumber?: string }
      type?: string
      vehicleId?: string
      message: string
      severity: string
      timestamp: string
    }>
    critical: number
    high: number
  }
}

export interface DashboardMetricsResponse {
  metric?: string
  period: {
    days: number
    from: string
    to: string
  }
  data: {
    efficiency?: Array<{ date: string; score: number | null }>
    fuel?: Array<{
      period: string
      consumption: number
      efficiency?: number | null
      vehicle: string
    }>
    alerts?: Array<{ date: string; total: number; high: number; critical: number }>
  }
}

export interface DashboardEmissionsResponse {
  period: string
  timeRange: {
    start: string
    end: string
  }
  emissions: {
    total_emissions: {
      CO2: number
      NOx?: number
      PM?: number
      CO2_equivalent?: number
    }
    emissions_by_fuel_type?: Record<string, { CO2: number }>
  }
  context: {
    totalFuelConsumption: number
    activeVehicleCount: number
    averageEmissionPerVehicle?: number
    emissionTrend?: string
    dataSource?: string
    note?: string
  }
  lastUpdated: string
}

// API response types
export interface ApiResponse<T = any> {
  message?: string
  data?: T
  error?: string
  errors?: Array<{ field: string; message: string }>
  metadata?: any
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }
}

// WebSocket types
export interface WebSocketMessage {
  type: string
  data: any
  timestamp: string
}

// Drag and drop types
export interface DragItem {
  id: string
  type: string
  data: any
}

export interface DropResult {
  destination?: {
    droppableId: string
    index: number
  }
  source: {
    droppableId: string
    index: number
  }
}

// Form types
export interface FormError {
  field: string
  message: string
}

// Utility types
export interface SelectOption {
  value: string | number
  label: string
  disabled?: boolean
}

export interface MapViewport {
  latitude: number
  longitude: number
  zoom: number
}

export interface EmissionsData {
  total_emissions: {
    CO2: number
    NOx: number
    PM: number
  }
  emissions_by_vehicle: Record<string, any>
  emissions_by_fuel_type: Record<string, any>
}

// Task types
export type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE'
export type TaskPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL'

export interface Task {
  id: string
  title: string
  description?: string
  priority: TaskPriority
  status: TaskStatus
  dueDate?: string
  assignerId: string
  completionNote?: string
  completedAt?: string
  createdAt: string
  updatedAt: string
  assigner: {
    id: string
    firstName: string
    lastName: string
    email: string
    role: UserRole
  }
  assignees: {
    id: string
    firstName: string
    lastName: string
    email: string
    role: UserRole
  }[]
}

export interface CreateTaskInput {
  title: string
  description?: string
  priority?: TaskPriority
  dueDate?: string
  assigneeIds: string[]
}

export interface UpdateTaskInput {
  title?: string
  description?: string
  priority?: TaskPriority
  dueDate?: string
  assigneeIds?: string[]
}

export interface UpdateTaskStatusInput {
  status: TaskStatus
  completionNote?: string
}

// Analysis types
export type TimePeriod = 'today' | 'week' | 'month' | 'quarter'

export interface AnalysisOverview {
  success: boolean
  period: TimePeriod
  timeRange: {
    start: string
    end: string
  }
  municipality: {
    totalVehicles: number
    totalEmployees: number
    activeShifts: number
    completedShifts: number
    totalShifts: number
  }
  vehicles: {
    distribution: Record<string, number>
    efficiencyByType: Array<{
      type: string
      averageEfficiency: number
    }>
    utilizationRate: number
    totalUtilized: number
  }
  workers: {
    totalEmployees: number
    averageCompletionRate: number
    averageEfficiencyScore: number
    totalHoursWorked: number
    performance: Array<{
      employeeId: string
      employeeName: string
      department: string
      totalShifts: number
      completedShifts: number
      completionRate: number
      averageEfficiency: number
      hoursWorked: number
      performanceScore: number
    }>
  }
  fuel: {
    totalConsumption: number
    totalCost: number
    averageEfficiency: number
    consumptionByVehicleType: Record<string, number>
    trends: Array<{
      period: string
      consumption: number
    }>
  }
  emissions: {
    total: {
      CO2: number
      NOx?: number
      PM?: number
    }
    byFuelType: Record<string, { CO2: number }>
    byVehicleType: Record<string, {
      vehicleCount: number
      totalCO2: number
      averageCO2PerVehicle: number
    }>
    averagePerVehicle: number
  }
}
