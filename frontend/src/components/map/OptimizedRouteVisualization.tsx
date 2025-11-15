/**
 * Optimized Route Visualization Component
 * Displays TSP-optimized routes with savings metrics and waypoint markers
 */

import { useMemo } from 'react'
import { PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import type { Layer } from '@deck.gl/core'
import type { OptimizedRoute, RouteNode } from '@/hooks/useRouteOptimization'
import { Zap, TrendingDown, Clock, Fuel, Navigation } from 'lucide-react'

export interface OptimizedRouteVisualizationProps {
  optimizedRoute: OptimizedRoute | null
  showWaypoints?: boolean
  showLabels?: boolean
  showMetrics?: boolean
  highlightedNodeId?: string | null
  onNodeClick?: (node: RouteNode) => void
}

/**
 * Generate Deck.gl layers for optimized route visualization
 */
export function useOptimizedRouteLayers({
  optimizedRoute,
  showWaypoints = true,
  showLabels = false,
  highlightedNodeId = null,
  onNodeClick,
}: Omit<OptimizedRouteVisualizationProps, 'showMetrics'>): Layer[] {

  const layers = useMemo(() => {
    if (!optimizedRoute) return []

    const result: Layer[] = []

    // 1. Route path layer - optimized route
    result.push(
      new PathLayer({
        id: 'optimized-route-path',
        data: [
          {
            path: optimizedRoute.sequence.map(node => node.position),
            color: [34, 197, 94, 200], // Green for optimized route
          }
        ],
        getPath: (d: any) => d.path,
        getColor: (d: any) => d.color,
        widthMinPixels: 4,
        widthMaxPixels: 10,
        capRounded: true,
        jointRounded: true,
        pickable: false,
      })
    )

    // 2. Waypoint markers
    if (showWaypoints && optimizedRoute.sequence.length > 0) {
      result.push(
        new ScatterplotLayer({
          id: 'optimized-route-waypoints',
          data: optimizedRoute.sequence.map((node, index) => ({
            ...node,
            index,
            isStart: index === 0,
            isEnd: index === optimizedRoute.sequence.length - 1,
            isHighlighted: node.id === highlightedNodeId,
          })),
          pickable: true,
          onClick: (info) => {
            if (info.object && onNodeClick) {
              onNodeClick(info.object as RouteNode)
            }
          },
          getPosition: (d: any) => d.position,
          getRadius: (d: any) => {
            if (d.isStart || d.isEnd) return 10
            if (d.isHighlighted) return 8
            return 6
          },
          getFillColor: (d: any) => {
            if (d.isStart) return [34, 197, 94, 255] // Green for start
            if (d.isEnd) return [239, 68, 68, 255] // Red for end
            if (d.isHighlighted) return [59, 130, 246, 255] // Blue for highlighted

            // Color by priority
            const priority = d.priority || 50
            const intensity = Math.floor((priority / 100) * 255)
            return [255, 255 - intensity, 0, 200] // Yellow to orange based on priority
          },
          getLineColor: [255, 255, 255, 255],
          getLineWidth: 2,
          stroked: true,
          radiusMinPixels: 4,
          radiusMaxPixels: 12,
          updateTriggers: {
            getRadius: highlightedNodeId,
            getFillColor: highlightedNodeId,
          }
        })
      )
    }

    // 3. Labels for waypoints
    if (showLabels && optimizedRoute.sequence.length > 0) {
      result.push(
        new TextLayer({
          id: 'optimized-route-labels',
          data: optimizedRoute.sequence.map((node, index) => ({
            position: node.position,
            text: `${index + 1}`,
            index,
          })),
          getPosition: (d: any) => d.position,
          getText: (d: any) => d.text,
          getSize: 14,
          getColor: [255, 255, 255, 255],
          getPixelOffset: [0, -20],
          fontFamily: 'Arial, sans-serif',
          fontWeight: 'bold',
          sizeUnits: 'pixels',
          background: true,
          getBackgroundColor: [0, 0, 0, 180],
          backgroundPadding: [4, 2],
          pickable: false,
        })
      )
    }

    // 4. Direction arrows along the path
    if (optimizedRoute.sequence.length > 1) {
      const arrowPoints = generateDirectionArrows(optimizedRoute.sequence, 0.3)

      result.push(
        new ScatterplotLayer({
          id: 'route-direction-arrows',
          data: arrowPoints,
          pickable: false,
          getPosition: (d: any) => d.position,
          getRadius: 3,
          getFillColor: [34, 197, 94, 180],
          radiusMinPixels: 2,
          radiusMaxPixels: 4,
        })
      )
    }

    return result
  }, [optimizedRoute, showWaypoints, showLabels, highlightedNodeId, onNodeClick])

  return layers
}

/**
 * Generate arrow points along the route to show direction
 */
function generateDirectionArrows(
  sequence: RouteNode[],
  spacing: number = 0.2 // fraction of total path (0-1)
): Array<{ position: [number, number] }> {
  const arrows: Array<{ position: [number, number] }> = []

  if (sequence.length < 2) return arrows

  // Calculate total segments
  const numArrows = Math.min(Math.floor(sequence.length * spacing), 20)
  const step = Math.max(1, Math.floor(sequence.length / numArrows))

  for (let i = 0; i < sequence.length - 1; i += step) {
    const current = sequence[i].position
    const next = sequence[i + 1].position

    // Add arrow at midpoint of segment
    const midpoint: [number, number] = [
      (current[0] + next[0]) / 2,
      (current[1] + next[1]) / 2,
    ]

    arrows.push({ position: midpoint })
  }

  return arrows
}

/**
 * Metrics display panel for optimized route
 */
export function OptimizedRouteMetrics({
  optimizedRoute,
  className = ''
}: {
  optimizedRoute: OptimizedRoute | null
  className?: string
}) {
  if (!optimizedRoute) return null

  const formatDistance = (meters: number) => {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(2)} km`
    }
    return `${meters.toFixed(0)} m`
  }

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = Math.floor(minutes % 60)
    if (hours > 0) {
      return `${hours}h ${mins}m`
    }
    return `${mins}m`
  }

  const formatFuel = (liters: number) => {
    return `${liters.toFixed(2)} L`
  }

  return (
    <div className={`card p-4 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold text-gray-900 flex items-center">
          <Zap className="w-4 h-4 mr-2 text-green-600" />
          Optimized Route
        </h4>
        <span className="text-xs text-gray-500">
          {optimizedRoute.algorithm} • {optimizedRoute.optimizationTimeMs}ms
        </span>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <MetricCard
          icon={<Navigation className="w-4 h-4" />}
          label="Distance"
          value={formatDistance(optimizedRoute.totalDistance)}
          savings={optimizedRoute.savings.distance.savedPercent}
          color="blue"
        />
        <MetricCard
          icon={<Clock className="w-4 h-4" />}
          label="Time"
          value={formatTime(optimizedRoute.totalTime)}
          savings={optimizedRoute.savings.time.savedPercent}
          color="purple"
        />
        <MetricCard
          icon={<Fuel className="w-4 h-4" />}
          label="Fuel"
          value={formatFuel(optimizedRoute.fuelCost)}
          savings={optimizedRoute.savings.fuel.savedPercent}
          color="orange"
        />
        <MetricCard
          icon={<TrendingDown className="w-4 h-4" />}
          label="Efficiency"
          value={`${optimizedRoute.efficiency.toFixed(1)}%`}
          color="green"
        />
      </div>

      {/* Savings Summary */}
      {optimizedRoute.savings.distance.savedPercent && optimizedRoute.savings.distance.savedPercent > 0 && (
        <div className="pt-3 border-t border-gray-200">
          <p className="text-xs text-green-600 font-medium flex items-center">
            <TrendingDown className="w-3 h-3 mr-1" />
            Saved {formatDistance(optimizedRoute.savings.distance.saved || 0)} •{' '}
            {formatTime(optimizedRoute.savings.time.saved || 0)} •{' '}
            {formatFuel(optimizedRoute.savings.fuel.saved || 0)}
          </p>
        </div>
      )}

      {/* Route Details */}
      <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-600">
        <div className="flex justify-between">
          <span>Waypoints:</span>
          <span className="font-medium">{optimizedRoute.sequence.length}</span>
        </div>
        {optimizedRoute.optimizationId && (
          <div className="flex justify-between mt-1">
            <span>ID:</span>
            <span className="font-mono text-xs">{optimizedRoute.optimizationId.slice(0, 8)}...</span>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Individual metric card
 */
function MetricCard({
  icon,
  label,
  value,
  savings,
  color = 'gray'
}: {
  icon: React.ReactNode
  label: string
  value: string
  savings?: number
  color?: 'blue' | 'purple' | 'orange' | 'green' | 'gray'
}) {
  const colorClasses = {
    blue: 'text-blue-600 bg-blue-50',
    purple: 'text-purple-600 bg-purple-50',
    orange: 'text-orange-600 bg-orange-50',
    green: 'text-green-600 bg-green-50',
    gray: 'text-gray-600 bg-gray-50',
  }

  return (
    <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
      <div className="flex items-center space-x-1.5 mb-1">
        <div className={colorClasses[color].split(' ')[0]}>
          {icon}
        </div>
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="text-sm font-bold">{value}</div>
      {savings !== undefined && savings > 0 && (
        <div className="text-xs mt-1 flex items-center text-green-700">
          <TrendingDown className="w-3 h-3 mr-0.5" />
          {savings.toFixed(1)}%
        </div>
      )}
    </div>
  )
}

/**
 * Waypoint list panel
 */
export function WaypointList({
  optimizedRoute,
  onNodeClick,
  highlightedNodeId,
  className = ''
}: {
  optimizedRoute: OptimizedRoute | null
  onNodeClick?: (node: RouteNode) => void
  highlightedNodeId?: string | null
  className?: string
}) {
  if (!optimizedRoute) return null

  return (
    <div className={`card p-4 ${className}`}>
      <h4 className="text-sm font-semibold text-gray-900 mb-3">
        Route Sequence ({optimizedRoute.sequence.length} stops)
      </h4>
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {optimizedRoute.sequence.map((node, index) => (
          <div
            key={node.id}
            onClick={() => onNodeClick?.(node)}
            className={`p-2 rounded-lg cursor-pointer transition-colors ${
              highlightedNodeId === node.id
                ? 'bg-blue-100 border-2 border-blue-500'
                : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  index === 0
                    ? 'bg-green-500 text-white'
                    : index === optimizedRoute.sequence.length - 1
                    ? 'bg-red-500 text-white'
                    : 'bg-gray-400 text-white'
                }`}>
                  {index + 1}
                </div>
                <div>
                  <div className="text-sm font-medium">{node.id}</div>
                  <div className="text-xs text-gray-500">
                    {node.position[1].toFixed(6)}, {node.position[0].toFixed(6)}
                  </div>
                </div>
              </div>
              {node.priority !== undefined && node.priority > 50 && (
                <div className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded-full">
                  Priority: {node.priority}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
