import { memo } from 'react'
import type { VehiclePosition } from '@/types/vehicles'

export interface VehicleMarkerProps {
  position: VehiclePosition
  isSelected?: boolean
  onClick?: (position: VehiclePosition) => void
  onHover?: (position: VehiclePosition | null) => void
}

/**
 * VehicleMarker - Represents a single vehicle on the map
 * This is a conceptual component - actual rendering is handled by Deck.gl IconLayer
 * This component is used for type safety and documentation
 */
export const VehicleMarker = memo(function VehicleMarker({
  position,
  isSelected = false,
  onClick,
  onHover
}: VehicleMarkerProps) {
  // This component is primarily for type safety
  // Actual rendering happens in useVehicleDeckLayers via IconLayer
  return null
})

/**
 * Get vehicle icon name based on status
 */
export function getVehicleIconName(
  status: 'ONLINE' | 'IDLE' | 'OFFLINE',
  isSelected: boolean
): 'vehicle' | 'vehicleSelected' | 'vehicleOffline' {
  if (isSelected) return 'vehicleSelected'
  if (status === 'OFFLINE') return 'vehicleOffline'
  return 'vehicle'
}

/**
 * Get vehicle color based on status
 */
export function getVehicleColor(
  status: 'ONLINE' | 'IDLE' | 'OFFLINE',
  colorIndex: number,
  isSelected: boolean
): [number, number, number, number] {
  const { ROUTE_COLORS } = require('@/types/vehicles')
  const base = ROUTE_COLORS[colorIndex % ROUTE_COLORS.length]

  if (isSelected) {
    return [base[0], base[1], base[2], 255]
  }

  switch (status) {
    case 'ONLINE':
      return [base[0], base[1], base[2], 220]
    case 'IDLE':
      return [base[0], base[1], base[2], 180]
    case 'OFFLINE':
      return [128, 128, 128, 150] // Gray
    default:
      return [base[0], base[1], base[2], 200]
  }
}

