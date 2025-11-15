/**
 * Cleaning Optimization Demo Page
 * Demonstrates the new cleaning algorithms and their results
 */

import { useState, useRef } from 'react'
import { Zap, Settings, BarChart3, Map, FileText } from 'lucide-react'
import { VehicleMapContainer } from '@/components/vehicles/FleetOverview/VehicleMapContainer'
import CleaningOptimizationPanel from '@/components/cleaning/CleaningOptimizationPanel'
import { useCleaningOptimizedRoutes, useCleaningVehicleData, useCleaningConstraints } from '@/hooks/useCleaningOptimizedRoutes'
import { createSampleCleaningData } from '@/utils/cleaningRouteIntegrator'
import type { VehicleDeckPoint, VehicleRouteSegment } from '@/types/vehicles'

export default function CleaningOptimizationDemo() {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const [activeTab, setActiveTab] = useState<'map' | 'optimization' | 'results'>('map')
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null)
  const [hoveredVehicle, setHoveredVehicle] = useState<VehicleDeckPoint | null>(null)
  const [hoverPosition, setHoverPosition] = useState({ x: 0, y: 0 })
  
  // Optimization settings
  const [enableCleaningOptimization, setEnableCleaningOptimization] = useState(true)
  const [optimizationLevel, setOptimizationLevel] = useState<'basic' | 'standard' | 'advanced' | 'maximum'>('advanced')
  const [cleaningPattern, setCleaningPattern] = useState('optimal')
  const [showCleaningPattern, setShowCleaningPattern] = useState(true)
  const [showFuelEfficiency, setShowFuelEfficiency] = useState(true)

  // Sample data
  const { area, vehicles, constraints } = createSampleCleaningData()
  
  // Convert to frontend format
  const vehiclePoints: VehicleDeckPoint[] = vehicles.map((vehicle, index) => ({
    vehicleId: vehicle.id,
    position: vehicle.currentLocation,
    heading: 45,
    status: 'ONLINE',
    plateNumber: `34ABC${(index + 1).toString().padStart(3, '0')}`,
    lastUpdate: new Date(),
    colorIndex: index
  }))

  const routeSegments: VehicleRouteSegment[] = area.streets.map((street, index) => ({
    vehicleId: vehicles[index % vehicles.length].id,
    path: street.path,
    timestamp: new Date(),
    colorIndex: index % vehicles.length
  }))

  // Apply cleaning optimization
  const cleaningVehicles = useCleaningVehicleData(vehicles)
  const cleaningConstraints = useCleaningConstraints(
    [{ start: 7, end: 9 }, { start: 17, end: 19 }], // Traffic hours
    [] // No maintenance windows
  )

  const {
    optimizedRoutes,
    isOptimizing,
    cleaningOptimization,
    performanceMetrics,
    recommendations,
    error
  } = useCleaningOptimizedRoutes({
    routeSegments,
    vehicles: cleaningVehicles,
    cleaningArea: area,
    enabled: enableCleaningOptimization,
    optimizationLevel,
    cleaningMode: enableCleaningOptimization,
    constraints: cleaningConstraints,
    cleaningOptions: {
      cleaningPattern: cleaningPattern as any,
      prioritizeBy: 'fuel_efficiency'
    }
  })

  const handleVehicleClick = (point: VehicleDeckPoint) => {
    setSelectedVehicleId(selectedVehicleId === point.vehicleId ? null : point.vehicleId)
  }

  const handleVehicleHover = (point: VehicleDeckPoint | null, event: any) => {
    setHoveredVehicle(point)
    if (event?.pixel) {
      setHoverPosition({ x: event.pixel[0], y: event.pixel[1] })
    }
  }

  const handleReoptimize = () => {
    // Trigger reoptimization by changing a dependency
    setOptimizationLevel(current => current === 'advanced' ? 'maximum' : 'advanced')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Zap className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">
                  Temizlik Aracı Rota Optimizasyonu
                </h1>
                <p className="text-sm text-gray-500">
                  Gelişmiş algoritmalar ile yakıt ve zaman tasarrufu
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-gray-700">
                  Temizlik Optimizasyonu
                </label>
                <button
                  onClick={() => setEnableCleaningOptimization(!enableCleaningOptimization)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    enableCleaningOptimization ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      enableCleaningOptimization ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              
              <div className="flex items-center space-x-2 text-sm">
                <span className="text-gray-500">Seviye:</span>
                <select
                  value={optimizationLevel}
                  onChange={(e) => setOptimizationLevel(e.target.value as any)}
                  className="border border-gray-300 rounded-md px-3 py-1 text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="basic">Temel</option>
                  <option value="standard">Standart</option>
                  <option value="advanced">Gelişmiş</option>
                  <option value="maximum">Maksimum</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            <button
              onClick={() => setActiveTab('map')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'map'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Map className="w-4 h-4 inline-block mr-2" />
              Harita Görünümü
            </button>
            
            <button
              onClick={() => setActiveTab('optimization')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'optimization'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Settings className="w-4 h-4 inline-block mr-2" />
              Optimizasyon Ayarları
            </button>
            
            <button
              onClick={() => setActiveTab('results')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'results'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <BarChart3 className="w-4 h-4 inline-block mr-2" />
              Sonuçlar & Metrikler
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Map Tab */}
        {activeTab === 'map' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Map */}
            <div className="lg:col-span-3">
              <div className="bg-white rounded-lg shadow-lg overflow-hidden">
                <div className="p-4 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium text-gray-900">
                      Temizlik Rotaları
                    </h3>
                    
                    <div className="flex items-center space-x-4 text-sm">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={showCleaningPattern}
                          onChange={(e) => setShowCleaningPattern(e.target.checked)}
                          className="mr-2"
                        />
                        Temizlik Deseni
                      </label>
                      
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={showFuelEfficiency}
                          onChange={(e) => setShowFuelEfficiency(e.target.checked)}
                          className="mr-2"
                        />
                        Yakıt Verimliliği
                      </label>
                    </div>
                  </div>
                </div>
                
                <div className="h-96">
                  <VehicleMapContainer
                    vehiclePoints={vehiclePoints}
                    routeSegments={routeSegments}
                    showVehicleLayer={true}
                    showRouteLayer={true}
                    showTripsLayer={false}
                    selectedVehicleId={selectedVehicleId}
                    onVehicleClick={handleVehicleClick}
                    onVehicleHover={handleVehicleHover}
                    hoveredVehicle={hoveredVehicle}
                    hoverPosition={hoverPosition}
                    enableCleaningOptimization={enableCleaningOptimization}
                    cleaningOptimizationLevel={optimizationLevel}
                    showCleaningPattern={showCleaningPattern}
                    showFuelEfficiency={showFuelEfficiency}
                    vehicles={vehicles}
                    center={[28.98, 41.01]}
                    zoom={14}
                  />
                </div>
              </div>
            </div>

            {/* Side Panel */}
            <div className="space-y-6">
              {/* Quick Stats */}
              <div className="bg-white rounded-lg shadow p-6">
                <h4 className="font-medium text-gray-900 mb-4">Hızlı İstatistikler</h4>
                
                {performanceMetrics ? (
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Yakıt Tasarrufu</span>
                      <span className="font-medium text-green-600">
                        %{performanceMetrics.fuelEfficiencyImprovement.toFixed(1)}
                      </span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Zaman Tasarrufu</span>
                      <span className="font-medium text-blue-600">
                        %{performanceMetrics.timeEfficiencyImprovement.toFixed(1)}
                      </span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Kapsama Verimliliği</span>
                      <span className="font-medium text-purple-600">
                        %{performanceMetrics.coverageEfficiency.toFixed(1)}
                      </span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Maliyet Tasarrufu</span>
                      <span className="font-medium text-orange-600">
                        ₺{performanceMetrics.costSavings.toFixed(0)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-gray-500">
                    {isOptimizing ? 'Hesaplanıyor...' : 'Optimizasyon bekleniyor'}
                  </div>
                )}
              </div>

              {/* Vehicle List */}
              <div className="bg-white rounded-lg shadow p-6">
                <h4 className="font-medium text-gray-900 mb-4">Temizlik Araçları</h4>
                
                <div className="space-y-2">
                  {vehicles.map((vehicle, index) => (
                    <div
                      key={vehicle.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedVehicleId === vehicle.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => setSelectedVehicleId(
                        selectedVehicleId === vehicle.id ? null : vehicle.id
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-sm">
                            Araç {index + 1}
                          </div>
                          <div className="text-xs text-gray-500">
                            {vehicle.type.toUpperCase()}
                          </div>
                        </div>
                        
                        <div className="text-right">
                          <div className="text-xs text-gray-500">
                            {vehicle.cleaningWidth}m genişlik
                          </div>
                          <div className="text-xs text-gray-500">
                            {vehicle.fuelEfficiency} km/L
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Optimization Tab */}
        {activeTab === 'optimization' && (
          <CleaningOptimizationPanel
            metrics={performanceMetrics}
            recommendations={recommendations}
            isOptimizing={isOptimizing}
            onOptimizationLevelChange={setOptimizationLevel}
            onPatternChange={setCleaningPattern}
            onReoptimize={handleReoptimize}
          />
        )}

        {/* Results Tab */}
        {activeTab === 'results' && (
          <div className="space-y-8">
            {/* Performance Summary */}
            {performanceMetrics && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-6">
                  Performans Özeti
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-600">
                      {performanceMetrics.fuelEfficiencyImprovement.toFixed(1)}%
                    </div>
                    <div className="text-sm text-gray-600 mt-1">Yakıt Tasarrufu</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {performanceMetrics.totalFuelSavings.toFixed(1)}L tasarruf
                    </div>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-3xl font-bold text-blue-600">
                      {performanceMetrics.timeEfficiencyImprovement.toFixed(1)}%
                    </div>
                    <div className="text-sm text-gray-600 mt-1">Zaman Tasarrufu</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {(performanceMetrics.totalTimeSavings / 60).toFixed(1)} saat tasarruf
                    </div>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-3xl font-bold text-purple-600">
                      {performanceMetrics.coverageEfficiency.toFixed(1)}%
                    </div>
                    <div className="text-sm text-gray-600 mt-1">Kapsama Verimliliği</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {performanceMetrics.overlapReduction.toFixed(0)}m çakışma azalması
                    </div>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-3xl font-bold text-orange-600">
                      ₺{performanceMetrics.costSavings.toFixed(0)}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">Maliyet Tasarrufu</div>
                    <div className="text-xs text-gray-500 mt-1">Aylık tasarruf</div>
                  </div>
                </div>
              </div>
            )}

            {/* Algorithm Details */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-6">
                Algoritma Detayları
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <h4 className="font-medium text-gray-900 mb-4">Kullanılan Algoritmalar</h4>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center">
                      <span className="w-2 h-2 bg-green-500 rounded-full mr-3"></span>
                      TSP Solver (Traveling Salesman Problem)
                    </li>
                    <li className="flex items-center">
                      <span className="w-2 h-2 bg-blue-500 rounded-full mr-3"></span>
                      Genetik Algoritma Optimizasyonu
                    </li>
                    <li className="flex items-center">
                      <span className="w-2 h-2 bg-purple-500 rounded-full mr-3"></span>
                      Karınca Kolonisi Optimizasyonu
                    </li>
                    <li className="flex items-center">
                      <span className="w-2 h-2 bg-orange-500 rounded-full mr-3"></span>
                      Douglas-Peucker Yol Basitleştirme
                    </li>
                  </ul>
                </div>
                
                <div>
                  <h4 className="font-medium text-gray-900 mb-4">Optimizasyon Faktörleri</h4>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center">
                      <span className="w-2 h-2 bg-red-500 rounded-full mr-3"></span>
                      U-dönüş ve keskin dönüş minimizasyonu
                    </li>
                    <li className="flex items-center">
                      <span className="w-2 h-2 bg-yellow-500 rounded-full mr-3"></span>
                      Çakışma önleme algoritması
                    </li>
                    <li className="flex items-center">
                      <span className="w-2 h-2 bg-indigo-500 rounded-full mr-3"></span>
                      Yakıt tüketimi optimizasyonu
                    </li>
                    <li className="flex items-center">
                      <span className="w-2 h-2 bg-pink-500 rounded-full mr-3"></span>
                      Trafik saatleri önleme
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Error Display */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex">
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">
                      Optimizasyon Hatası
                    </h3>
                    <div className="mt-2 text-sm text-red-700">
                      {error}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}