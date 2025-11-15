import { memo, useMemo } from 'react'
import { Truck, Activity, Clock, AlertTriangle } from 'lucide-react'
import type { VehicleWithLocation } from '@/hooks/useVehicleLiveData'

export interface VehicleSummaryHeaderProps {
  vehicles: VehicleWithLocation[]
  getVehicleStatus: (vehicle: VehicleWithLocation) => {
    status: 'ONLINE' | 'IDLE' | 'OFFLINE'
    color: string
    bg: string
  }
  className?: string
}

/**
 * VehicleSummaryHeader - Summary statistics for the fleet
 */
export const VehicleSummaryHeader = memo(function VehicleSummaryHeader({
  vehicles,
  getVehicleStatus,
  className = ''
}: VehicleSummaryHeaderProps) {
  const stats = useMemo(() => {
    const online = vehicles.filter((v) => getVehicleStatus(v).status === 'ONLINE').length
    const idle = vehicles.filter((v) => getVehicleStatus(v).status === 'IDLE').length
    const offline = vehicles.filter((v) => getVehicleStatus(v).status === 'OFFLINE').length

    return {
      total: vehicles.length,
      online,
      idle,
      offline
    }
  }, [vehicles, getVehicleStatus])

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-4 gap-4 ${className}`}>
      <div className="card p-4">
        <div className="flex items-center">
          <div className="p-2 bg-blue-50 rounded-lg">
            <Truck className="h-5 w-5 text-blue-600" />
          </div>
          <div className="ml-3">
            <p className="text-sm font-medium text-gray-500">Toplam Araç</p>
            <p className="text-lg font-semibold text-gray-900">{stats.total}</p>
          </div>
        </div>
      </div>

      <div className="card p-4">
        <div className="flex items-center">
          <div className="p-2 bg-green-50 rounded-lg">
            <Activity className="h-5 w-5 text-green-600" />
          </div>
          <div className="ml-3">
            <p className="text-sm font-medium text-gray-500">Aktif</p>
            <p className="text-lg font-semibold text-gray-900">{stats.online}</p>
          </div>
        </div>
      </div>

      <div className="card p-4">
        <div className="flex items-center">
          <div className="p-2 bg-yellow-50 rounded-lg">
            <Clock className="h-5 w-5 text-yellow-600" />
          </div>
          <div className="ml-3">
            <p className="text-sm font-medium text-gray-500">Boşta</p>
            <p className="text-lg font-semibold text-gray-900">{stats.idle}</p>
          </div>
        </div>
      </div>

      <div className="card p-4">
        <div className="flex items-center">
          <div className="p-2 bg-red-50 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
          <div className="ml-3">
            <p className="text-sm font-medium text-gray-500">Çevrimdışı</p>
            <p className="text-lg font-semibold text-gray-900">{stats.offline}</p>
          </div>
        </div>
      </div>
    </div>
  )
})

