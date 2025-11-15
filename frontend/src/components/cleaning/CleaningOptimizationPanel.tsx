/**
 * Cleaning Optimization Panel
 * Displays cleaning route optimization results and controls
 */

import { useState } from 'react'
import { 
  Zap, 
  TrendingDown, 
  Clock, 
  Fuel, 
  BarChart3, 
  Settings,
  CheckCircle,
  AlertTriangle,
  Info,
  RotateCcw,
  ArrowRight
} from 'lucide-react'
import type { CleaningPerformanceMetrics } from '@/utils/cleaningRouteIntegrator'
import type { CleaningOptimizationOptions } from '@/utils/cleaningRouteIntegrator'

interface CleaningOptimizationPanelProps {
  metrics: CleaningPerformanceMetrics | null
  recommendations: any[]
  isOptimizing: boolean
  onOptimizationLevelChange: (level: 'basic' | 'standard' | 'advanced' | 'maximum') => void
  onPatternChange: (pattern: string) => void
  onReoptimize: () => void
  className?: string
}

export function CleaningOptimizationPanel({
  metrics,
  recommendations,
  isOptimizing,
  onOptimizationLevelChange,
  onPatternChange,
  onReoptimize,
  className = ''
}: CleaningOptimizationPanelProps) {
  const [showSettings, setShowSettings] = useState(false)
  const [optimizationLevel, setOptimizationLevel] = useState<'basic' | 'standard' | 'advanced' | 'maximum'>('standard')
  const [cleaningPattern, setCleaningPattern] = useState('optimal')

  const handleOptimizationLevelChange = (level: typeof optimizationLevel) => {
    setOptimizationLevel(level)
    onOptimizationLevelChange(level)
  }

  const handlePatternChange = (pattern: string) => {
    setCleaningPattern(pattern)
    onPatternChange(pattern)
  }

  return (
    <div className={`bg-white rounded-lg shadow-lg p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Zap className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Temizlik Optimizasyonu</h3>
            <p className="text-sm text-gray-500">Rota ve yakıt verimliliği analizi</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50"
            title="Ayarlar"
          >
            <Settings className="w-5 h-5" />
          </button>
          <button
            onClick={onReoptimize}
            disabled={isOptimizing}
            className="flex items-center px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            <RotateCcw className={`w-4 h-4 mr-2 ${isOptimizing ? 'animate-spin' : ''}`} />
            {isOptimizing ? 'Optimize Ediliyor...' : 'Yeniden Optimize Et'}
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg border-l-4 border-blue-500">
          <h4 className="font-medium text-gray-900 mb-4">Optimizasyon Ayarları</h4>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Optimizasyon Seviyesi
              </label>
              <select
                value={optimizationLevel}
                onChange={(e) => handleOptimizationLevelChange(e.target.value as any)}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="basic">Temel</option>
                <option value="standard">Standart</option>
                <option value="advanced">Gelişmiş</option>
                <option value="maximum">Maksimum</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Temizlik Deseni
              </label>
              <select
                value={cleaningPattern}
                onChange={(e) => handlePatternChange(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="optimal">Optimal</option>
                <option value="spiral">Spiral</option>
                <option value="grid">Izgara</option>
                <option value="back_forth">İleri-Geri</option>
                <option value="perimeter_first">Çevre Önce</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Performance Metrics */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <MetricCard
            icon={<Fuel className="w-5 h-5 text-green-600" />}
            title="Yakıt Tasarrufu"
            value={`${metrics.fuelEfficiencyImprovement.toFixed(1)}%`}
            subtitle={`${metrics.totalFuelSavings.toFixed(1)}L tasarruf`}
            color="green"
          />
          
          <MetricCard
            icon={<Clock className="w-5 h-5 text-blue-600" />}
            title="Zaman Tasarrufu"
            value={`${metrics.timeEfficiencyImprovement.toFixed(1)}%`}
            subtitle={`${(metrics.totalTimeSavings / 60).toFixed(1)} saat tasarruf`}
            color="blue"
          />
          
          <MetricCard
            icon={<BarChart3 className="w-5 h-5 text-purple-600" />}
            title="Kapsama Verimliliği"
            value={`${metrics.coverageEfficiency.toFixed(1)}%`}
            subtitle={`${metrics.overlapReduction.toFixed(0)}m çakışma azalması`}
            color="purple"
          />
          
          <MetricCard
            icon={<TrendingDown className="w-5 h-5 text-orange-600" />}
            title="U-Dönüş Azalması"
            value={`${metrics.turnaroundReduction.toFixed(1)}%`}
            subtitle={`Daha az yakıt tüketimi`}
            color="orange"
          />
        </div>
      )}

      {/* Cost Savings Summary */}
      {metrics && (
        <div className="mb-6 p-4 bg-gradient-to-r from-green-50 to-blue-50 rounded-lg border border-green-200">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-gray-900">Toplam Maliyet Tasarrufu</h4>
              <p className="text-sm text-gray-600">Optimizasyon ile elde edilen tasarruf</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-green-600">
                ₺{metrics.costSavings.toFixed(0)}
              </div>
              <div className="text-sm text-gray-500">aylık tasarruf</div>
            </div>
          </div>
        </div>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-medium text-gray-900 flex items-center">
            <Info className="w-4 h-4 mr-2 text-blue-500" />
            Optimizasyon Önerileri
          </h4>
          
          <div className="space-y-2">
            {recommendations.slice(0, 3).map((recommendation, index) => (
              <RecommendationCard
                key={index}
                recommendation={recommendation}
              />
            ))}
          </div>
          
          {recommendations.length > 3 && (
            <button className="w-full text-center text-sm text-blue-600 hover:text-blue-800 py-2">
              {recommendations.length - 3} öğe daha göster
            </button>
          )}
        </div>
      )}

      {/* Loading State */}
      {isOptimizing && (
        <div className="text-center py-8">
          <div className="inline-flex items-center px-4 py-2 bg-blue-50 rounded-lg">
            <RotateCcw className="w-5 h-5 text-blue-600 animate-spin mr-3" />
            <span className="text-blue-700 font-medium">Route optimize ediliyor...</span>
          </div>
        </div>
      )}
    </div>
  )
}

interface MetricCardProps {
  icon: React.ReactNode
  title: string
  value: string
  subtitle: string
  color: 'green' | 'blue' | 'purple' | 'orange'
}

function MetricCard({ icon, title, value, subtitle, color }: MetricCardProps) {
  const colorClasses = {
    green: 'bg-green-50 border-green-200',
    blue: 'bg-blue-50 border-blue-200',
    purple: 'bg-purple-50 border-purple-200',
    orange: 'bg-orange-50 border-orange-200'
  }

  return (
    <div className={`p-4 rounded-lg border ${colorClasses[color]}`}>
      <div className="flex items-center justify-between mb-2">
        <div>{icon}</div>
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-sm font-medium text-gray-700">{title}</div>
      <div className="text-xs text-gray-500">{subtitle}</div>
    </div>
  )
}

interface RecommendationCardProps {
  recommendation: {
    type: string
    priority: 'high' | 'medium' | 'low'
    description: string
    estimatedImpact: number
    implementationCost: string
    timeToImplement: string
  }
}

function RecommendationCard({ recommendation }: RecommendationCardProps) {
  const priorityIcons = {
    high: <AlertTriangle className="w-4 h-4 text-red-500" />,
    medium: <Info className="w-4 h-4 text-yellow-500" />,
    low: <CheckCircle className="w-4 h-4 text-green-500" />
  }

  const priorityColors = {
    high: 'border-red-200 bg-red-50',
    medium: 'border-yellow-200 bg-yellow-50',
    low: 'border-green-200 bg-green-50'
  }

  return (
    <div className={`p-3 rounded-lg border ${priorityColors[recommendation.priority]}`}>
      <div className="flex items-start space-x-3">
        <div className="mt-0.5">
          {priorityIcons[recommendation.priority]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h5 className="text-sm font-medium text-gray-900 capitalize">
              {recommendation.type.replace('_', ' ')} Optimizasyonu
            </h5>
            <span className="text-xs text-gray-500">
              %{recommendation.estimatedImpact} iyileşme
            </span>
          </div>
          <p className="text-sm text-gray-600 mb-2">
            {recommendation.description}
          </p>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Maliyet: {recommendation.implementationCost}</span>
            <span>Süre: {recommendation.timeToImplement}</span>
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-gray-400 mt-1" />
      </div>
    </div>
  )
}

export default CleaningOptimizationPanel