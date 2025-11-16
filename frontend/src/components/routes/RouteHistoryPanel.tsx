/**
 * Route History Panel
 * Displays previously optimized routes with comparison functionality
 */

import { useState, useEffect } from 'react'
import {
  History,
  TrendingDown,
  Clock,
  Fuel,
  Route as RouteIcon,
  Eye,
  Trash2,
  CheckCircle,
  Circle,
  BarChart2,
  Calendar,
  RefreshCw
} from 'lucide-react'
import { OptimizedRoute } from '@/hooks/useRouteOptimization'
import { apiClient } from '@/services/api'
import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'

interface RouteHistoryItem {
  id: string
  vehicleId: string
  vehicleRouteId?: string
  vehicle: {
    plateNumber: string
    type: string
    model: string
  }
  algorithm: string
  pattern: string
  optimizedDistance: number
  optimizedTime: number
  optimizedFuelCost: number
  distanceSavings?: number
  distanceSavingsPercent?: number
  timeSavings?: number
  timeSavingsPercent?: number
  fuelSavings?: number
  fuelSavingsPercent?: number
  numberOfStops: number
  optimizedPath: Array<[number, number]>
  isApplied: boolean
  createdAt: string
}

interface RouteHistoryPanelProps {
  vehicleId?: string
  onRouteSelect?: (route: RouteHistoryItem) => void
  onCompare?: (routes: RouteHistoryItem[]) => void
}

export function RouteHistoryPanel({
  vehicleId,
  onRouteSelect,
  onCompare,
}: RouteHistoryPanelProps) {
  const [history, setHistory] = useState<RouteHistoryItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedRoutes, setSelectedRoutes] = useState<Set<string>>(new Set())
  const [compareMode, setCompareMode] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Fetch history when vehicle changes
  useEffect(() => {
    if (vehicleId) {
      fetchHistory()
    }
  }, [vehicleId])

  const fetchHistory = async () => {
    if (!vehicleId) return

    setIsLoading(true)
    try {
      const response = await apiClient.getOptimizationHistory(vehicleId, 20)
      if (response.success && response.data) {
        setHistory(response.data)
      }
    } catch (error) {
      console.error('Failed to fetch route history:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleRouteClick = (route: RouteHistoryItem) => {
    if (compareMode) {
      toggleRouteSelection(route.id)
    } else {
      onRouteSelect?.(route)
      setExpandedId(expandedId === route.id ? null : route.id)
    }
  }

  const toggleRouteSelection = (routeId: string) => {
    const newSelection = new Set(selectedRoutes)
    if (newSelection.has(routeId)) {
      newSelection.delete(routeId)
    } else {
      if (newSelection.size < 3) {
        // Limit to 3 routes for comparison
        newSelection.add(routeId)
      }
    }
    setSelectedRoutes(newSelection)
  }

  const handleCompare = () => {
    const routesToCompare = history.filter((route) => selectedRoutes.has(route.id))
    onCompare?.(routesToCompare)
  }

  const handleMarkAsApplied = async (routeId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await apiClient.markOptimizationAsApplied(routeId)
      // Refresh history
      fetchHistory()
    } catch (error) {
      console.error('Failed to mark route as applied:', error)
    }
  }

  if (!vehicleId) {
    return (
      <div className="p-8 text-center text-gray-500">
        <History className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>Geçmiş rotaları görüntülemek için bir araç seçin</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-gray-700" />
            <h3 className="font-semibold text-gray-900">Rota Geçmişi</h3>
          </div>
          <button
            onClick={fetchHistory}
            disabled={isLoading}
            className="p-1 text-gray-500 hover:text-gray-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Compare Mode Toggle */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              setCompareMode(!compareMode)
              setSelectedRoutes(new Set())
            }}
            className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${
              compareMode
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <BarChart2 className="w-4 h-4 inline mr-1" />
            {compareMode ? 'Karşılaştırma Modunda' : 'Karşılaştır'}
          </button>

          {compareMode && selectedRoutes.size >= 2 && (
            <button
              onClick={handleCompare}
              className="text-sm px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              {selectedRoutes.size} Rotayı Karşılaştır
            </button>
          )}
        </div>

        {compareMode && (
          <p className="text-xs text-gray-500 mt-2">
            Karşılaştırmak için en fazla 3 rota seçin ({selectedRoutes.size}/3)
          </p>
        )}
      </div>

      {/* History List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-500">Yükleniyor...</p>
          </div>
        ) : history.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <History className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Henüz optimize edilmiş rota yok</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {history.map((route) => {
              const isSelected = selectedRoutes.has(route.id)
              const isExpanded = expandedId === route.id

              return (
                <div
                  key={route.id}
                  className={`p-4 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-blue-50 border-l-4 border-blue-600'
                      : 'hover:bg-gray-50'
                  } ${route.isApplied ? 'bg-green-50' : ''}`}
                  onClick={() => handleRouteClick(route)}
                >
                  <div className="flex items-start gap-3">
                    {/* Selection Checkbox (in compare mode) */}
                    {compareMode && (
                      <div className="mt-1">
                        {isSelected ? (
                          <CheckCircle className="w-5 h-5 text-blue-600" />
                        ) : (
                          <Circle className="w-5 h-5 text-gray-300" />
                        )}
                      </div>
                    )}

                    {/* Route Info */}
                    <div className="flex-1 min-w-0">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 text-sm">
                              {route.numberOfStops} Durak
                            </span>
                            <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-full capitalize">
                              {route.algorithm}
                            </span>
                            {route.isApplied && (
                              <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                                Uygulandı
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                            <Calendar className="w-3 h-3" />
                            {formatDistanceToNow(new Date(route.createdAt), {
                              addSuffix: true,
                              locale: tr,
                            })}
                          </div>
                        </div>

                        {!route.isApplied && !compareMode && (
                          <button
                            onClick={(e) => handleMarkAsApplied(route.id, e)}
                            className="text-xs px-2 py-1 text-green-600 hover:bg-green-50 rounded"
                          >
                            Uygula
                          </button>
                        )}
                      </div>

                      {/* Metrics Grid */}
                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-white rounded p-2">
                          <div className="flex items-center gap-1 text-gray-600 mb-0.5">
                            <RouteIcon className="w-3 h-3" />
                            <span className="text-xs">Mesafe</span>
                          </div>
                          <div className="text-sm font-semibold text-gray-900">
                            {(route.optimizedDistance / 1000).toFixed(1)} km
                          </div>
                          {route.distanceSavingsPercent && route.distanceSavingsPercent > 0 && (
                            <div className="text-xs text-green-600 flex items-center gap-0.5">
                              <TrendingDown className="w-3 h-3" />
                              {route.distanceSavingsPercent.toFixed(0)}%
                            </div>
                          )}
                        </div>

                        <div className="bg-white rounded p-2">
                          <div className="flex items-center gap-1 text-gray-600 mb-0.5">
                            <Clock className="w-3 h-3" />
                            <span className="text-xs">Süre</span>
                          </div>
                          <div className="text-sm font-semibold text-gray-900">
                            {route.optimizedTime.toFixed(0)} dk
                          </div>
                          {route.timeSavingsPercent && route.timeSavingsPercent > 0 && (
                            <div className="text-xs text-green-600 flex items-center gap-0.5">
                              <TrendingDown className="w-3 h-3" />
                              {route.timeSavingsPercent.toFixed(0)}%
                            </div>
                          )}
                        </div>

                        <div className="bg-white rounded p-2">
                          <div className="flex items-center gap-1 text-gray-600 mb-0.5">
                            <Fuel className="w-3 h-3" />
                            <span className="text-xs">Yakıt</span>
                          </div>
                          <div className="text-sm font-semibold text-gray-900">
                            {route.optimizedFuelCost.toFixed(1)} L
                          </div>
                          {route.fuelSavingsPercent && route.fuelSavingsPercent > 0 && (
                            <div className="text-xs text-green-600 flex items-center gap-0.5">
                              <TrendingDown className="w-3 h-3" />
                              {route.fuelSavingsPercent.toFixed(0)}%
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Expanded Details */}
                      {isExpanded && !compareMode && (
                        <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-gray-500">Algoritma:</span>
                              <span className="ml-1 font-medium capitalize">{route.algorithm}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Desen:</span>
                              <span className="ml-1 font-medium capitalize">{route.pattern}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Araç:</span>
                              <span className="ml-1 font-medium">{route.vehicle.plateNumber}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Durak Sayısı:</span>
                              <span className="ml-1 font-medium">{route.numberOfStops}</span>
                            </div>
                          </div>

                          {route.distanceSavings && (
                            <div className="text-xs bg-green-50 border border-green-200 rounded p-2">
                              <div className="font-medium text-green-800 mb-1">Tasarruf:</div>
                              <div className="space-y-0.5 text-green-700">
                                {route.distanceSavings > 0 && (
                                  <div>
                                    ↓ {(route.distanceSavings / 1000).toFixed(1)} km mesafe
                                  </div>
                                )}
                                {route.timeSavings && route.timeSavings > 0 && (
                                  <div>↓ {route.timeSavings.toFixed(0)} dakika zaman</div>
                                )}
                                {route.fuelSavings && route.fuelSavings > 0 && (
                                  <div>↓ {route.fuelSavings.toFixed(1)} L yakıt</div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Route Comparison Modal
 */
interface RouteComparisonModalProps {
  routes: RouteHistoryItem[]
  onClose: () => void
  onSelectRoute?: (route: RouteHistoryItem) => void
}

export function RouteComparisonModal({
  routes,
  onClose,
  onSelectRoute,
}: RouteComparisonModalProps) {
  if (routes.length === 0) return null

  // Calculate best route for each metric
  const bestDistance = routes.reduce((min, route) =>
    route.optimizedDistance < min.optimizedDistance ? route : min
  )
  const bestTime = routes.reduce((min, route) =>
    route.optimizedTime < min.optimizedTime ? route : min
  )
  const bestFuel = routes.reduce((min, route) =>
    route.optimizedFuelCost < min.optimizedFuelCost ? route : min
  )

  const getBestSavings = (metric: 'distance' | 'time' | 'fuel') => {
    return routes.reduce((max, route) => {
      const percent =
        metric === 'distance'
          ? route.distanceSavingsPercent || 0
          : metric === 'time'
          ? route.timeSavingsPercent || 0
          : route.fuelSavingsPercent || 0
      const maxPercent =
        metric === 'distance'
          ? max.distanceSavingsPercent || 0
          : metric === 'time'
          ? max.timeSavingsPercent || 0
          : max.fuelSavingsPercent || 0
      return percent > maxPercent ? route : max
    })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Rota Karşılaştırması</h2>
            <p className="text-sm text-gray-500 mt-1">{routes.length} rota karşılaştırılıyor</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-blue-700 mb-2">
                <RouteIcon className="w-5 h-5" />
                <span className="font-medium">En Kısa Mesafe</span>
              </div>
              <div className="text-2xl font-bold text-blue-900">
                {(bestDistance.optimizedDistance / 1000).toFixed(1)} km
              </div>
              <div className="text-sm text-blue-700 mt-1 capitalize">
                {bestDistance.algorithm} algoritması
              </div>
            </div>

            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-purple-700 mb-2">
                <Clock className="w-5 h-5" />
                <span className="font-medium">En Hızlı Süre</span>
              </div>
              <div className="text-2xl font-bold text-purple-900">
                {bestTime.optimizedTime.toFixed(0)} dk
              </div>
              <div className="text-sm text-purple-700 mt-1 capitalize">
                {bestTime.algorithm} algoritması
              </div>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-green-700 mb-2">
                <Fuel className="w-5 h-5" />
                <span className="font-medium">En Az Yakıt</span>
              </div>
              <div className="text-2xl font-bold text-green-900">
                {bestFuel.optimizedFuelCost.toFixed(1)} L
              </div>
              <div className="text-sm text-green-700 mt-1 capitalize">
                {bestFuel.algorithm} algoritması
              </div>
            </div>
          </div>

          {/* Detailed Comparison Table */}
          <div className="overflow-x-auto">
            <table className="w-full border border-gray-200 rounded-lg">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Algoritma
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Durak
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">
                    Mesafe
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">
                    Süre
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">
                    Yakıt
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase">
                    Tasarruf
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase">
                    Aksiyon
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {routes.map((route) => (
                  <tr key={route.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium capitalize">{route.algorithm}</span>
                        {route.isApplied && (
                          <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">
                            Uygulandı
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatDistanceToNow(new Date(route.createdAt), {
                          addSuffix: true,
                          locale: tr,
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">{route.numberOfStops}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-sm font-medium">
                        {(route.optimizedDistance / 1000).toFixed(1)} km
                      </div>
                      {route.id === bestDistance.id && (
                        <div className="text-xs text-blue-600 font-medium">En iyi</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-sm font-medium">
                        {route.optimizedTime.toFixed(0)} dk
                      </div>
                      {route.id === bestTime.id && (
                        <div className="text-xs text-purple-600 font-medium">En iyi</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-sm font-medium">
                        {route.optimizedFuelCost.toFixed(1)} L
                      </div>
                      {route.id === bestFuel.id && (
                        <div className="text-xs text-green-600 font-medium">En iyi</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {(route.distanceSavingsPercent || 0) > 0 ||
                      (route.timeSavingsPercent || 0) > 0 ||
                      (route.fuelSavingsPercent || 0) > 0 ? (
                        <div className="text-xs space-y-0.5">
                          {(route.distanceSavingsPercent || 0) > 0 && (
                            <div className="text-blue-600">
                              ↓{route.distanceSavingsPercent?.toFixed(0)}% mesafe
                            </div>
                          )}
                          {(route.timeSavingsPercent || 0) > 0 && (
                            <div className="text-purple-600">
                              ↓{route.timeSavingsPercent?.toFixed(0)}% süre
                            </div>
                          )}
                          {(route.fuelSavingsPercent || 0) > 0 && (
                            <div className="text-green-600">
                              ↓{route.fuelSavingsPercent?.toFixed(0)}% yakıt
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => {
                          onSelectRoute?.(route)
                          onClose()
                        }}
                        className="px-3 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded"
                      >
                        <Eye className="w-3 h-3 inline mr-1" />
                        Görüntüle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Recommendation */}
          <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-start gap-3">
              <div className="text-yellow-600 mt-0.5">💡</div>
              <div>
                <div className="font-medium text-yellow-900 mb-1">Öneri</div>
                <div className="text-sm text-yellow-800">
                  {bestDistance.id === bestTime.id && bestTime.id === bestFuel.id ? (
                    <>
                      <strong className="capitalize">{bestDistance.algorithm}</strong> algoritması tüm
                      metriklerde en iyi sonucu verdi. Bu rotayı kullanmanızı öneririz.
                    </>
                  ) : (
                    <>
                      Farklı algoritmalar farklı metriklerde öne çıkıyor. Yakıt tasarrufu için{' '}
                      <strong className="capitalize">{bestFuel.algorithm}</strong>, hız için{' '}
                      <strong className="capitalize">{bestTime.algorithm}</strong> algoritmasını tercih
                      edebilirsiniz.
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
