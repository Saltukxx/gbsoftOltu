import React, { useEffect, useState } from 'react'
import type { VehicleDeckPoint } from '@/types/vehicles'

interface VehicleTooltipProps {
  point: VehicleDeckPoint | null
  x: number
  y: number
}

/**
 * Tooltip component for vehicle hover information
 * Positioned relative to map container using fixed positioning
 */
export function VehicleTooltip({ point, x, y }: VehicleTooltipProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 })

  useEffect(() => {
    if (point && x && y) {
      setPosition({ x, y })
    }
  }, [point, x, y])

  if (!point) return null

  return (
    <div
      className="fixed pointer-events-none z-50 bg-gray-900 text-white text-xs rounded-lg shadow-lg p-2 max-w-xs"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translate(-50%, -100%)',
        marginTop: '-8px'
      }}
    >
      <div className="font-semibold mb-1">{point.plateNumber}</div>
      <div className="text-gray-300">
        <div>Hız: {Math.round(point.speed)} km/h</div>
        <div className="text-gray-400 text-xs mt-1">
          {new Date(point.recordedAt).toLocaleTimeString('tr-TR')}
        </div>
      </div>
      {/* Arrow */}
      <div
        className="absolute top-full left-1/2 transform -translate-x-1/2"
        style={{
          width: 0,
          height: 0,
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          borderTop: '6px solid #111827'
        }}
      />
    </div>
  )
}

