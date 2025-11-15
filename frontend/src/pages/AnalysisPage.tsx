import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/services/api'
import type { AnalysisOverview, TimePeriod } from '@/types'
import {
  Truck,
  Users,
  Calendar,
  Fuel,
  Leaf,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { RoleGuard, UserRole } from '@/components/guards/RoleGuard'
import { PageLoading } from '@/components/ui/LoadingStates'
import { useToast, useNetworkStatus } from '@/components/ui/Toast'
import { TimePeriodSelector } from '@/components/analysis/TimePeriodSelector'
import { VehicleFleetChart } from '@/components/analysis/VehicleFleetChart'
import { WorkerPerformanceChart } from '@/components/analysis/WorkerPerformanceChart'
import { FuelAnalysisChart } from '@/components/analysis/FuelAnalysisChart'
import { EmissionsChart } from '@/components/analysis/EmissionsChart'

function AnalysisPageContent() {
  const toast = useToast()
  const { isOnline } = useNetworkStatus()
  const [period, setPeriod] = useState<TimePeriod>('month')

  const { data: analysisData, isLoading, error } = useQuery({
    queryKey: ['analysis-overview', period],
    queryFn: async () => {
      try {
        const response = await apiClient.get<AnalysisOverview>(`/api/analysis/overview?period=${period}`)
        // Ensure response has success property
        if (response && typeof response === 'object' && 'success' in response) {
          return response
        }
        // If response doesn't have success, wrap it
        return { success: true, ...response } as AnalysisOverview
      } catch (err: any) {
        if (err?.code === 'ECONNREFUSED' || !err?.response) {
          throw new Error('Sunucuya bağlanılamıyor')
        }
        // Handle 500 errors specifically
        if (err?.response?.status === 500) {
          const errorMessage = err?.response?.data?.message || err?.response?.data?.error || 'Sunucu hatası oluştu'
          throw new Error(errorMessage)
        }
        throw err
      }
    },
    enabled: isOnline,
    refetchInterval: isOnline ? 120000 : false, // Refetch every 2 minutes
    refetchOnWindowFocus: false,
    staleTime: 60000, // Consider data fresh for 60 seconds
    retry: (failureCount, error: any) => {
      if (error?.message?.includes('Sunucuya bağlanılamıyor') || !error?.response) {
        return false
      }
      // Don't retry 500 errors
      if (error?.response?.status === 500) {
        return false
      }
      return failureCount < 2
    },
    onError: (error: any) => {
      if (!error?.message?.includes('Sunucuya bağlanılamıyor')) {
        const errorMessage = error?.response?.data?.message || error?.message || 'Analiz verisi alınamadı'
        toast.error('Analiz verisi alınamadı', errorMessage)
      }
    },
  })

  if (isLoading) {
    return <PageLoading message="Analiz verileri yükleniyor..." />
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <AlertTriangle className="w-12 h-12 text-red-500" />
        <div className="text-center">
          <h3 className="text-lg font-medium text-gray-900">Veri Yüklenemedi</h3>
          <p className="text-sm text-gray-500 mt-1">
            Analiz verileri alınamadı. Lütfen sayfayı yenileyin.
          </p>
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

  if (!analysisData) {
    return null
  }

  const { municipality, vehicles, workers, fuel, emissions } = analysisData

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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analiz</h1>
          <p className="mt-1 text-sm text-gray-500">
            Belediye operasyonlarının kapsamlı analizi
          </p>
        </div>
        <TimePeriodSelector value={period} onChange={setPeriod} />
      </div>

      {/* Municipality Overview */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Belediye Genel Bakış</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="card p-6">
            <div className="flex items-center">
              <div className="p-3 rounded-lg bg-blue-50">
                <Truck className="h-6 w-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Toplam Araç</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {municipality.totalVehicles}
                </p>
              </div>
            </div>
          </div>

          <div className="card p-6">
            <div className="flex items-center">
              <div className="p-3 rounded-lg bg-green-50">
                <Users className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Toplam Çalışan</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {municipality.totalEmployees}
                </p>
              </div>
            </div>
          </div>

          <div className="card p-6">
            <div className="flex items-center">
              <div className="p-3 rounded-lg bg-purple-50">
                <Calendar className="h-6 w-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Aktif Vardiyalar</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {municipality.activeShifts}
                  <span className="text-sm text-gray-500">/{municipality.totalShifts}</span>
                </p>
              </div>
            </div>
          </div>

          <div className="card p-6">
            <div className="flex items-center">
              <div className="p-3 rounded-lg bg-orange-50">
                <Fuel className="h-6 w-6 text-orange-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Toplam Yakıt</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {fuel.totalConsumption.toFixed(0)} L
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Vehicle Fleet Analysis */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Araç Filosu Analizi</h2>
        <VehicleFleetChart
          distribution={vehicles.distribution}
          efficiencyByType={vehicles.efficiencyByType}
          utilizationRate={vehicles.utilizationRate}
        />
      </div>

      {/* Worker Performance */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Çalışan Performansı</h2>
        <WorkerPerformanceChart
          performance={workers.performance}
          averageCompletionRate={workers.averageCompletionRate}
          averageEfficiencyScore={workers.averageEfficiencyScore}
          totalHoursWorked={workers.totalHoursWorked}
        />
      </div>

      {/* Fuel Analysis */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Yakıt Analizi</h2>
        <FuelAnalysisChart
          totalConsumption={fuel.totalConsumption}
          totalCost={fuel.totalCost}
          averageEfficiency={fuel.averageEfficiency}
          consumptionByVehicleType={fuel.consumptionByVehicleType}
          trends={fuel.trends}
        />
      </div>

      {/* Carbon Emissions */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Karbon Emisyonları</h2>
        <EmissionsChart
          total={emissions.total}
          byFuelType={emissions.byFuelType}
          byVehicleType={emissions.byVehicleType}
          averagePerVehicle={emissions.averagePerVehicle}
        />
      </div>
    </div>
  )
}

export default function AnalysisPage() {
  return (
    <ErrorBoundary>
      <RoleGuard requiredRole={UserRole.SUPERVISOR}>
        <AnalysisPageContent />
      </RoleGuard>
    </ErrorBoundary>
  )
}

