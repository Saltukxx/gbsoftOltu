import { memo, useCallback, useMemo } from 'react'
import { Truck, MapPin, Fuel, Search, X } from 'lucide-react'
import type { VehicleWithLocation } from '@/hooks/useVehicleLiveData'

export interface VehicleListPanelProps {
  vehicles: VehicleWithLocation[]
  selectedVehicle: VehicleWithLocation | null
  onVehicleSelect: (vehicle: VehicleWithLocation) => void
  onVehicleDeselect: () => void
  getVehicleStatus: (vehicle: VehicleWithLocation) => {
    status: 'ONLINE' | 'IDLE' | 'OFFLINE'
    color: string
    bg: string
  }
  getFuelLevel: (vehicle: VehicleWithLocation) => number
  searchQuery?: string
  onSearchChange?: (query: string) => void
  className?: string
}

/**
 * VehicleListPanel - Side panel showing list of vehicles with search and filters
 */
export const VehicleListPanel = memo(function VehicleListPanel({
  vehicles,
  selectedVehicle,
  onVehicleSelect,
  onVehicleDeselect,
  getVehicleStatus,
  getFuelLevel,
  searchQuery = '',
  onSearchChange,
  className = ''
}: VehicleListPanelProps) {
  const handleVehicleClick = useCallback(
    (vehicle: VehicleWithLocation) => {
      if (selectedVehicle?.id === vehicle.id) {
        onVehicleDeselect()
      } else {
        onVehicleSelect(vehicle)
      }
    },
    [selectedVehicle, onVehicleSelect, onVehicleDeselect]
  )

  // Filter vehicles based on search query
  const filteredVehicles = useMemo(() => {
    if (!searchQuery.trim()) return vehicles
    const query = searchQuery.toLowerCase()
    return vehicles.filter(
      (vehicle) =>
        vehicle.plateNumber.toLowerCase().includes(query) ||
        vehicle.type.toLowerCase().includes(query) ||
        vehicle.model?.toLowerCase().includes(query)
    )
  }, [vehicles, searchQuery])

  return (
    <div className={`card p-6 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900">Araç Listesi</h3>
        <span className="text-sm text-gray-500">{filteredVehicles.length} araç</span>
      </div>

      {/* Search */}
      {onSearchChange && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Araç ara..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="input pl-10 w-full"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Vehicle List */}
      <div className="space-y-3 max-h-96 overflow-y-auto scrollbar-thin">
        {filteredVehicles.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Truck className="w-12 h-12 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">Araç bulunamadı</p>
          </div>
        ) : (
          filteredVehicles.map((vehicle) => {
            const status = getVehicleStatus(vehicle)
            const fuelLevel = getFuelLevel(vehicle)
            const isSelected = selectedVehicle?.id === vehicle.id

            return (
              <div
                key={vehicle.id}
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                  isSelected
                    ? 'border-blue-300 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
                onClick={() => handleVehicleClick(vehicle)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <Truck className="w-4 h-4 text-gray-400" />
                    <span className="font-medium text-sm">{vehicle.plateNumber}</span>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full ${status.bg} ${status.color}`}>
                    {status.status === 'ONLINE' && 'Çevrimiçi'}
                    {status.status === 'IDLE' && 'Boşta'}
                    {status.status === 'OFFLINE' && 'Çevrimdışı'}
                  </span>
                </div>

                <div className="text-xs text-gray-600 mb-2">{vehicle.type}</div>

                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-3">
                    <div className="flex items-center">
                      <Fuel className="w-3 h-3 text-gray-400 mr-1" />
                      <span className={fuelLevel < 20 ? 'text-red-600' : 'text-gray-600'}>
                        {fuelLevel}%
                      </span>
                    </div>
                  </div>
                  {vehicle.lastLocation && (
                    <div className="flex items-center">
                      <MapPin className="w-3 h-3 text-gray-400 mr-1" />
                      <span>
                        {vehicle.lastLocation.speed
                          ? Math.round(vehicle.lastLocation.speed)
                          : 0}{' '}
                        km/h
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
})

