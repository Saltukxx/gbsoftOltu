import React from 'react'
import { Truck, Route, Play, Map } from 'lucide-react'

interface LayerToggleGroupProps {
  showVehicleLayer: boolean
  showRouteLayer: boolean
  showTripsLayer?: boolean
  showRoadNetwork?: boolean
  onToggleVehicleLayer: () => void
  onToggleRouteLayer: () => void
  onToggleTripsLayer?: () => void
  onToggleRoadNetwork?: () => void
  className?: string
}

/**
 * Component for toggling Deck.gl layer visibility
 * Provides UI controls for vehicles, routes, and trip animation layers
 */
export function LayerToggleGroup({
  showVehicleLayer,
  showRouteLayer,
  showTripsLayer = false,
  showRoadNetwork = false,
  onToggleVehicleLayer,
  onToggleRouteLayer,
  onToggleTripsLayer,
  onToggleRoadNetwork,
  className = ''
}: LayerToggleGroupProps) {
  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <button
        onClick={onToggleVehicleLayer}
        className={`btn btn-secondary text-xs ${
          showVehicleLayer ? 'border-blue-300 bg-blue-50 text-blue-700' : ''
        }`}
        title="Araçları göster/gizle"
      >
        <Truck className="w-3.5 h-3.5 mr-1" />
        Araçlar
      </button>
      <button
        onClick={onToggleRouteLayer}
        className={`btn btn-secondary text-xs ${
          showRouteLayer ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : ''
        }`}
        title="Rotaları göster/gizle"
      >
        <Route className="w-3.5 h-3.5 mr-1" />
        Rotalar
      </button>
      {onToggleTripsLayer && (
        <button
          onClick={onToggleTripsLayer}
          className={`btn btn-secondary text-xs ${
            showTripsLayer ? 'border-purple-300 bg-purple-50 text-purple-700' : ''
          }`}
          title="Animasyonlu rotaları göster/gizle"
        >
          <Play className="w-3.5 h-3.5 mr-1" />
          Animasyon
        </button>
      )}
      {onToggleRoadNetwork && (
        <button
          onClick={onToggleRoadNetwork}
          className={`btn btn-secondary text-xs ${
            showRoadNetwork ? 'border-gray-400 bg-gray-50 text-gray-700' : ''
          }`}
          title="Yol ağını göster/gizle"
        >
          <Map className="w-3.5 h-3.5 mr-1" />
          Yollar
        </button>
      )}
    </div>
  )
}

