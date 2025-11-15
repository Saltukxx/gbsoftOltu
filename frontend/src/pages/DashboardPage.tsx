import React, { useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/services/api'
import type { DashboardSummary, DashboardMetricsResponse, DashboardEmissionsResponse } from '@/types'
import { 
  Users, 
  Truck, 
  MessageCircle, 
  AlertTriangle,
  Calendar,
  TrendingUp,
  Fuel,
  Leaf
} from 'lucide-react'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { RoleGuard, UserRole } from '@/components/guards/RoleGuard'
import { PageLoading } from '@/components/ui/LoadingStates'
import { useToast, useNetworkStatus } from '@/components/ui/Toast'
import { MiniTrendChart } from '@/components/dashboard/MiniTrendChart'

export function DashboardPageContent() {
  const toast = useToast()
  const { isOnline } = useNetworkStatus()

  const { data: dashboardData, isLoading, error } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: async () => {
      try {
        return await apiClient.get<DashboardSummary>('/api/dashboard/summary')
      } catch (err: any) {
        if (err?.code === 'ECONNREFUSED' || !err?.response) {
          throw new Error('Sunucuya bağlanılamıyor')
        }
        throw err
      }
    },
    refetchInterval: isOnline ? 60000 : false, // Reduced to 60 seconds
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
        toast.error('Dashboard verisi alınamadı', error.message)
      }
    }
  })

  const { data: emissionsData } = useQuery({
    queryKey: ['dashboard-emissions'],
    queryFn: async () => {
      try {
        return await apiClient.get<DashboardEmissionsResponse>('/api/dashboard/emissions')
      } catch (err: any) {
        if (err?.code === 'ECONNREFUSED' || !err?.response) {
          throw new Error('Sunucuya bağlanılamıyor')
        }
        throw err
      }
    },
    enabled: isOnline && !!dashboardData, // Only fetch after summary loads
    refetchInterval: isOnline ? 120000 : false, // Reduced to 2 minutes
    refetchOnWindowFocus: false,
    staleTime: 60000, // Consider data fresh for 60 seconds
    retry: (failureCount, error: any) => {
      if (error?.message?.includes('Sunucuya bağlanılamıyor') || !error?.response) {
        return false
      }
      return failureCount < 1
    },
    onError: (error: any) => {
      if (!error?.message?.includes('Sunucuya bağlanılamıyor')) {
        toast.warning('Emisyon verisi alınamadı', 'Bağlantınızı kontrol edin')
      }
    }
  })

  const { data: metricsData } = useQuery({
    queryKey: ['dashboard-metrics'],
    queryFn: async () => {
      try {
        return await apiClient.get<DashboardMetricsResponse>('/api/dashboard/metrics?days=14')
      } catch (err: any) {
        if (err?.code === 'ECONNREFUSED' || !err?.response) {
          throw new Error('Sunucuya bağlanılamıyor')
        }
        throw err
      }
    },
    enabled: isOnline && !!dashboardData, // Only fetch after summary loads
    refetchInterval: isOnline ? 120000 : false, // Reduced to 2 minutes
    refetchOnWindowFocus: false,
    staleTime: 60000, // Consider data fresh for 60 seconds
    retry: (failureCount, error: any) => {
      if (error?.message?.includes('Sunucuya bağlanılamıyor') || !error?.response) {
        return false
      }
      return failureCount < 1
    },
    onError: () => {
      // Silent fail for metrics - not critical
    }
  })

  const efficiencyTrend = useMemo(() => {
    return metricsData?.data.efficiency?.map((item) => ({
      label: new Date(item.date).toLocaleDateString('tr-TR', { month: 'short', day: 'numeric' }),
      value: Math.round(((item.score ?? 0) * 100) * 100) / 100,
    })) ?? []
  }, [metricsData])

  const fuelTrend = useMemo(() => {
    return metricsData?.data.fuel?.map((item) => ({
      label: item.period,
      value: Math.round(item.consumption),
    })) ?? []
  }, [metricsData])

  const alertTrend = useMemo(() => {
    return metricsData?.data.alerts?.map((item) => ({
      label: new Date(item.date).toLocaleDateString('tr-TR', { month: 'short', day: 'numeric' }),
      value: item.total,
    })) ?? []
  }, [metricsData])

  // Memoize stats to avoid recalculation on every render
  // IMPORTANT: All hooks must be called before any conditional returns
  const stats = useMemo(() => [
    {
      name: 'Aktif Vardiyalar',
      value: dashboardData?.shifts.active || 0,
      total: dashboardData?.shifts.total || 0,
      icon: Calendar,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      name: 'Aktif Araçlar',
      value: dashboardData?.vehicles.currentlyActive || 0,
      total: dashboardData?.vehicles.total || 0,
      icon: Truck,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      name: 'Okunmamış Mesajlar',
      value: dashboardData?.messages.unread || 0,
      total: '',
      icon: MessageCircle,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
    {
      name: 'Kritik Uyarılar',
      value: dashboardData?.alerts.critical || 0,
      total: dashboardData?.alerts.recent.length || 0,
      icon: AlertTriangle,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
    },
  ], [dashboardData])

  // Memoize recent items to avoid recalculation
  const recentShifts = useMemo(() => dashboardData?.shifts.recent?.slice(0, 5) || [], [dashboardData?.shifts.recent])
  const recentLocations = useMemo(() => dashboardData?.vehicles.recentLocations?.slice(0, 4) || [], [dashboardData?.vehicles.recentLocations])
  const recentAlerts = useMemo(() => dashboardData?.alerts.recent?.slice(0, 4) || [], [dashboardData?.alerts.recent])

  // Conditional returns AFTER all hooks
  if (isLoading) {
    return <PageLoading message="Dashboard yükleniyor..." />
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <AlertTriangle className="w-12 h-12 text-red-500" />
        <div className="text-center">
          <h3 className="text-lg font-medium text-gray-900">Veri Yüklenemedi</h3>
          <p className="text-sm text-gray-500 mt-1">Dashboard verileri alınamadı. Lütfen sayfayı yenileyin.</p>
        </div>
        <button 
          onClick={() => window.location.reload()}
          className="btn btn-primary"
        >
          Sayfayı Yenile
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Network status indicator */}
      {!isOnline && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertTriangle className="w-5 h-5 text-orange-600 mr-2" />
            <span className="text-orange-800 font-medium">İnternet bağlantısı yok</span>
            <span className="text-orange-600 ml-2">Veriler güncel olmayabilir</span>
          </div>
        </div>
      )}
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Oltu Belediyesi operasyonlarının genel görünümü
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.name} className="card p-6">
            <div className="flex items-center">
              <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`h-6 w-6 ${stat.color}`} />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">{stat.name}</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {stat.value}
                  {stat.total && <span className="text-sm text-gray-500">/{stat.total}</span>}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Shifts */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">Son Vardiyalar</h3>
            <Users className="h-5 w-5 text-gray-400" />
          </div>
          <div className="space-y-3">
            {recentShifts.map((shift) => (
              <div key={shift.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {shift.employee.user.firstName} {shift.employee.user.lastName}
                  </p>
                  <p className="text-xs text-gray-500">
                    {shift.slot} • {new Date(shift.day).toLocaleDateString('tr-TR')}
                  </p>
                </div>
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                  shift.status === 'ACTIVE' 
                    ? 'bg-green-100 text-green-800'
                    : shift.status === 'COMPLETED'
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {shift.status === 'ACTIVE' && 'Aktif'}
                  {shift.status === 'COMPLETED' && 'Tamamlandı'}
                  {shift.status === 'SCHEDULED' && 'Planlandı'}
                </span>
              </div>
            )) || (
              <p className="text-sm text-gray-500 text-center py-4">
                Henüz vardiya bulunmuyor
              </p>
            )}
          </div>
        </div>

        {/* Vehicle Status */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">Araç Durumu</h3>
            <Truck className="h-5 w-5 text-gray-400" />
          </div>
          <div className="space-y-3">
            {recentLocations.map((location) => (
              <div key={location.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {location.vehicle?.plateNumber}
                  </p>
                  <p className="text-xs text-gray-500">
                    {location.speed ? `${Math.round(location.speed)} km/h` : 'Durgun'}
                  </p>
                </div>
                <div className="text-right">
                  <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                  <p className="text-xs text-gray-500 mt-1">Online</p>
                </div>
              </div>
            )) || (
              <p className="text-sm text-gray-500 text-center py-4">
                Aktif araç bulunamadı
              </p>
            )}
          </div>
        </div>

        {/* Recent Alerts */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">Son Uyarılar</h3>
            <AlertTriangle className="h-5 w-5 text-gray-400" />
          </div>
          <div className="space-y-3">
            {recentAlerts.map((alert, index) => (
              <div key={index} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                <div className={`w-2 h-2 rounded-full mt-2 ${
                  alert.severity === 'CRITICAL' ? 'bg-red-500' :
                  alert.severity === 'HIGH' ? 'bg-orange-500' :
                  'bg-yellow-500'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900">{alert.message}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(alert.timestamp).toLocaleString('tr-TR')}
                  </p>
                </div>
              </div>
            )) || (
              <p className="text-sm text-gray-500 text-center py-4">
                Uyarı bulunmuyor
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Fuel Efficiency */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">Yakıt Verimliliği</h3>
            <Fuel className="h-5 w-5 text-gray-400" />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Ortalama</span>
              <span className="text-sm font-medium">
                {dashboardData?.fuel.averageEfficiency?.toFixed(1) || '0'} km/L
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Toplam Tüketim</span>
              <span className="text-sm font-medium">
                {dashboardData?.fuel.totalConsumption?.toFixed(0) || '0'} L
              </span>
            </div>
            <div className="mt-4 pt-4 border-t">
              <div className="flex items-center text-sm text-green-600">
                <TrendingUp className="w-4 h-4 mr-1" />
                %2.5 geçen haftaya göre
              </div>
            </div>
          </div>
        </div>

        {/* Emissions */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">Emisyon</h3>
            <Leaf className="h-5 w-5 text-gray-400" />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">CO2 (Bu ay)</span>
              <span className="text-sm font-medium">
                {emissionsData?.emissions?.total_emissions?.CO2?.toFixed(0) || '0'} kg
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Araç Başına</span>
              <span className="text-sm font-medium">
                {emissionsData?.context?.averageEmissionPerVehicle?.toFixed(0) || '0'} kg
              </span>
            </div>
            <div className="mt-4 pt-4 border-t">
              <div className="flex items-center text-sm text-orange-600">
                <TrendingUp className="w-4 h-4 mr-1" />
                Hedef: %15 azalma
              </div>
            </div>
          </div>
        </div>

        {/* System Status */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">Sistem Durumu</h3>
            <div className="w-2 h-2 bg-green-400 rounded-full"></div>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">API Durumu</span>
              <span className="text-sm font-medium text-green-600">Çalışıyor</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">AI Servisi</span>
              <span className="text-sm font-medium text-green-600">Çalışıyor</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">WebSocket</span>
              <span className="text-sm font-medium text-green-600">Bağlı</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Veritabanı</span>
              <span className="text-sm font-medium text-green-600">Çalışıyor</span>
            </div>
          </div>
        </div>
      </div>

      {/* Trend Insights */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="card p-6">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-lg font-medium text-gray-900">Vardiya Verimliliği (%)</h3>
              <p className="text-xs text-gray-500">Son 14 gün</p>
            </div>
            <TrendingUp className="h-5 w-5 text-emerald-500" />
          </div>
          <MiniTrendChart
            points={efficiencyTrend}
            colorClass="text-emerald-500"
            ariaLabel="Vardiya verimlilik trendi"
          />
          <div className="mt-4 text-sm text-gray-600">
            Ortalama: {(efficiencyTrend.reduce((sum, p) => sum + p.value, 0) / (efficiencyTrend.length || 1)).toFixed(1)}%
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-lg font-medium text-gray-900">Yakıt Tüketimi (L)</h3>
              <p className="text-xs text-gray-500">Dönemsel raporlar</p>
            </div>
            <Fuel className="h-5 w-5 text-blue-500" />
          </div>
          <MiniTrendChart
            points={fuelTrend}
            colorClass="text-blue-500"
            ariaLabel="Yakıt tüketim trendi"
          />
          <div className="mt-4 text-sm text-gray-600">
            Son rapor: {(fuelTrend[fuelTrend.length - 1]?.value ?? 0).toFixed(0)} L
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-lg font-medium text-gray-900">Uyarı Yoğunluğu</h3>
              <p className="text-xs text-gray-500">Telemetri alarm trendi</p>
            </div>
            <AlertTriangle className="h-5 w-5 text-rose-500" />
          </div>
          <MiniTrendChart
            points={alertTrend}
            colorClass="text-rose-500"
            ariaLabel="Uyarı trendi"
          />
          <div className="mt-4 text-sm text-gray-600">
            Günlük ortalama: {(alertTrend.reduce((sum, p) => sum + p.value, 0) / (alertTrend.length || 1)).toFixed(1)}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <ErrorBoundary>
      <RoleGuard requiredRole={UserRole.MESSENGER}>
        <DashboardPageContent />
      </RoleGuard>
    </ErrorBoundary>
  )
}
