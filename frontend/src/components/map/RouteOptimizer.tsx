/**
 * Route Optimizer Component
 * Interactive UI for selecting waypoints and optimizing routes
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import { Settings, Play, Trash2, MapPin, Plus, Check } from 'lucide-react'
import { useRouteOptimization, RouteNode, VehicleProfile, OptimizationOptions } from '@/hooks/useRouteOptimization'
import { useOptimizedRouteLayers, OptimizedRouteMetrics, WaypointList } from './OptimizedRouteVisualization'

export interface RouteOptimizerProps {
  map: mapboxgl.Map | null
  enabled: boolean
  vehicleId: string
  vehicleProfile?: VehicleProfile
  vehicleRouteId?: string
  onRouteOptimized?: (route: any) => void
  onLayersChange?: (layers: any[]) => void
}

export function useRouteOptimizer({
  map,
  enabled,
  vehicleId,
  vehicleProfile,
  vehicleRouteId,
  onRouteOptimized,
  onLayersChange,
}: RouteOptimizerProps) {
  const [nodes, setNodes] = useState<RouteNode[]>([])
  const [startPosition, setStartPosition] = useState<[number, number] | null>(null)
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [options, setOptions] = useState<OptimizationOptions>({
    algorithm: 'hybrid',
    priorityWeight: 0.3,
    fuelOptimization: true,
    timeLimitMs: 15000,
  })

  const markersRef = useRef<mapboxgl.Marker[]>([])

  const {
    optimizedRoute,
    isOptimizing,
    error,
    optimizeRoute: performOptimization,
    clearOptimization,
  } = useRouteOptimization({
    vehicleId,
    vehicleProfile,
    vehicleRouteId,
    saveToDatabase: true,
  })

  // Generate visualization layers
  const layers = useOptimizedRouteLayers({
    optimizedRoute,
    showWaypoints: true,
    showLabels: true,
    highlightedNodeId,
    onNodeClick: (node) => setHighlightedNodeId(node.id),
  })

  // Update parent with layers
  useEffect(() => {
    onLayersChange?.(layers)
  }, [layers, onLayersChange])

  // Handle map clicks to add waypoints
  useEffect(() => {
    if (!map || !enabled) {
      // Cleanup markers
      markersRef.current.forEach(marker => marker.remove())
      markersRef.current = []
      return
    }

    const handleMapClick = (e: mapboxgl.MapMouseEvent) => {
      const { lng, lat } = e.lngLat
      const position: [number, number] = [lng, lat]

      if (!startPosition) {
        // Set start position
        setStartPosition(position)
        addMarker(map, position, 'start', 'Start Point')
      } else {
        // Add waypoint
        const newNode: RouteNode = {
          id: `node-${nodes.length + 1}`,
          position,
          priority: 50,
          metadata: {},
        }
        setNodes(prev => [...prev, newNode])
        addMarker(map, position, 'waypoint', `Waypoint ${nodes.length + 1}`)
      }
    }

    map.on('click', handleMapClick)

    return () => {
      map.off('click', handleMapClick)
      clearMarkers()
    }
  }, [map, enabled, startPosition, nodes.length])

  const addMarker = (
    mapInstance: mapboxgl.Map,
    position: [number, number],
    type: 'start' | 'waypoint',
    label: string
  ) => {
    const el = document.createElement('div')
    el.className = 'route-optimizer-marker'
    el.style.width = type === 'start' ? '40px' : '32px'
    el.style.height = type === 'start' ? '40px' : '32px'
    el.style.borderRadius = '50%'
    el.style.backgroundColor = type === 'start' ? '#10b981' : '#3b82f6'
    el.style.border = '3px solid white'
    el.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)'
    el.style.cursor = 'pointer'
    el.title = label

    const marker = new mapboxgl.Marker(el)
      .setLngLat(position)
      .addTo(mapInstance)

    markersRef.current.push(marker)
  }

  const clearMarkers = () => {
    markersRef.current.forEach(marker => marker.remove())
    markersRef.current = []
  }

  const handleOptimize = useCallback(async () => {
    if (!startPosition || nodes.length === 0) {
      return
    }

    const result = await performOptimization(nodes, startPosition, options)

    if (result) {
      onRouteOptimized?.(result)
    }
  }, [startPosition, nodes, options, performOptimization, onRouteOptimized])

  const handleClear = useCallback(() => {
    clearMarkers()
    setNodes([])
    setStartPosition(null)
    setHighlightedNodeId(null)
    clearOptimization()
  }, [clearOptimization])

  const handleRemoveNode = useCallback((nodeId: string) => {
    setNodes(prev => prev.filter(n => n.id !== nodeId))
    // Recreate markers
    clearMarkers()
    if (startPosition && map) {
      addMarker(map, startPosition, 'start', 'Start Point')
      nodes.filter(n => n.id !== nodeId).forEach((node, index) => {
        addMarker(map, node.position, 'waypoint', `Waypoint ${index + 1}`)
      })
    }
  }, [nodes, startPosition, map])

  const handleUpdateNodePriority = useCallback((nodeId: string, priority: number) => {
    setNodes(prev => prev.map(node =>
      node.id === nodeId ? { ...node, priority } : node
    ))
  }, [])

  return {
    nodes,
    startPosition,
    optimizedRoute,
    isOptimizing,
    error,
    highlightedNodeId,
    showSettings,
    options,
    layers,
    setHighlightedNodeId,
    setShowSettings,
    setOptions,
    handleOptimize,
    handleClear,
    handleRemoveNode,
    handleUpdateNodePriority,
  }
}

/**
 * Route Optimizer UI Component
 */
export function RouteOptimizerUI({
  nodes,
  startPosition,
  optimizedRoute,
  isOptimizing,
  error,
  highlightedNodeId,
  showSettings,
  options,
  onOptimize,
  onClear,
  onRemoveNode,
  onUpdateNodePriority,
  onHighlightNode,
  onToggleSettings,
  onOptionsChange,
  className = ''
}: {
  nodes: RouteNode[]
  startPosition: [number, number] | null
  optimizedRoute: any
  isOptimizing: boolean
  error: string | null
  highlightedNodeId: string | null
  showSettings: boolean
  options: OptimizationOptions
  onOptimize: () => void
  onClear: () => void
  onRemoveNode: (nodeId: string) => void
  onUpdateNodePriority: (nodeId: string, priority: number) => void
  onHighlightNode: (nodeId: string | null) => void
  onToggleSettings: () => void
  onOptionsChange: (options: OptimizationOptions) => void
  className?: string
}) {
  if (!startPosition && nodes.length === 0) {
    return (
      <div className={`card p-4 ${className}`}>
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <MapPin className="w-4 h-4" />
          <span>Click on map to set start point, then add waypoints</span>
        </div>
      </div>
    )
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header with Actions */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-semibold text-gray-900">Route Optimizer</h4>
          <div className="flex space-x-2">
            <button
              onClick={onToggleSettings}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={onClear}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="Clear All"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Status */}
        <div className="space-y-2 mb-4">
          {startPosition && (
            <div className="text-xs text-gray-600">
              <span className="inline-block w-3 h-3 bg-green-500 rounded-full mr-2"></span>
              Start: {startPosition[1].toFixed(6)}, {startPosition[0].toFixed(6)}
            </div>
          )}
          <div className="text-xs text-gray-600">
            <span className="inline-block w-3 h-3 bg-blue-500 rounded-full mr-2"></span>
            Waypoints: {nodes.length}
          </div>
        </div>

        {/* Optimize Button */}
        <button
          onClick={onOptimize}
          disabled={isOptimizing || nodes.length === 0 || !startPosition}
          className="w-full btn-primary flex items-center justify-center space-x-2"
        >
          {isOptimizing ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
              <span>Optimizing...</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              <span>Optimize Route</span>
            </>
          )}
        </button>

        {error && (
          <div className="mt-2 p-2 bg-red-50 text-red-600 text-xs rounded-lg">
            {error}
          </div>
        )}
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="card p-4">
          <h5 className="text-sm font-semibold text-gray-900 mb-3">Optimization Settings</h5>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Algorithm
              </label>
              <select
                value={options.algorithm}
                onChange={(e) => onOptionsChange({ ...options, algorithm: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="hybrid">Hybrid (Recommended)</option>
                <option value="nearest_neighbor">Nearest Neighbor</option>
                <option value="genetic">Genetic Algorithm</option>
                <option value="ant_colony">Ant Colony</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Priority Weight: {options.priorityWeight?.toFixed(2)}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={options.priorityWeight || 0.3}
                onChange={(e) => onOptionsChange({ ...options, priorityWeight: parseFloat(e.target.value) })}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Distance</span>
                <span>Priority</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-gray-700">
                Fuel Optimization
              </label>
              <input
                type="checkbox"
                checked={options.fuelOptimization ?? true}
                onChange={(e) => onOptionsChange({ ...options, fuelOptimization: e.target.checked })}
                className="rounded border-gray-300"
              />
            </div>
          </div>
        </div>
      )}

      {/* Waypoint List */}
      {nodes.length > 0 && (
        <div className="card p-4">
          <h5 className="text-sm font-semibold text-gray-900 mb-3">Waypoints</h5>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {nodes.map((node, index) => (
              <div
                key={node.id}
                className={`p-2 rounded-lg transition-colors ${
                  highlightedNodeId === node.id
                    ? 'bg-blue-100 border-2 border-blue-500'
                    : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                }`}
                onMouseEnter={() => onHighlightNode(node.id)}
                onMouseLeave={() => onHighlightNode(null)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold">
                      {index + 1}
                    </div>
                    <span className="text-xs font-medium">{node.id}</span>
                  </div>
                  <button
                    onClick={() => onRemoveNode(node.id)}
                    className="text-red-500 hover:bg-red-50 p-1 rounded"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>

                <div className="ml-8">
                  <label className="block text-xs text-gray-600 mb-1">
                    Priority: {node.priority || 50}
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={node.priority || 50}
                    onChange={(e) => onUpdateNodePriority(node.id, parseInt(e.target.value))}
                    className="w-full h-1"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Optimized Route Metrics */}
      {optimizedRoute && <OptimizedRouteMetrics optimizedRoute={optimizedRoute} />}
    </div>
  )
}
