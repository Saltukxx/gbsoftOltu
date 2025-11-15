import React from 'react'
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

interface VehicleFleetChartProps {
  distribution: Record<string, number>
  efficiencyByType: Array<{
    type: string
    averageEfficiency: number
  }>
  utilizationRate: number
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

export const VehicleFleetChart: React.FC<VehicleFleetChartProps> = ({
  distribution,
  efficiencyByType,
  utilizationRate,
}) => {
  const distributionData = Object.entries(distribution).map(([type, count]) => ({
    name: type,
    value: count,
  }))

  const efficiencyData = efficiencyByType.map((item) => ({
    name: item.type,
    efficiency: Number(item.averageEfficiency.toFixed(2)),
  }))

  return (
    <div className="space-y-6">
      {/* Vehicle Distribution */}
      <div className="card p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Araç Dağılımı</h3>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={distributionData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {distributionData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Efficiency by Type */}
      <div className="card p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Araç Tipine Göre Ortalama Verimlilik (km/L)
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={efficiencyData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="efficiency" fill="#3b82f6" name="Verimlilik (km/L)" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Utilization Rate */}
      <div className="card p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Araç Kullanım Oranı</h3>
        <div className="flex items-center justify-center">
          <div className="relative w-48 h-48">
            <svg className="transform -rotate-90 w-48 h-48">
              <circle
                cx="96"
                cy="96"
                r="80"
                stroke="#e5e7eb"
                strokeWidth="16"
                fill="none"
              />
              <circle
                cx="96"
                cy="96"
                r="80"
                stroke="#3b82f6"
                strokeWidth="16"
                fill="none"
                strokeDasharray={`${(utilizationRate / 100) * 502.4} 502.4`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-900">
                  {utilizationRate.toFixed(1)}%
                </div>
                <div className="text-sm text-gray-500">Kullanım Oranı</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

