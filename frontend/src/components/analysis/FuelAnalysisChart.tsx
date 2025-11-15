import React from 'react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

interface FuelAnalysisChartProps {
  totalConsumption: number
  totalCost: number
  averageEfficiency: number
  consumptionByVehicleType: Record<string, number>
  trends: Array<{
    period: string
    consumption: number
  }>
}

export const FuelAnalysisChart: React.FC<FuelAnalysisChartProps> = ({
  totalConsumption,
  totalCost,
  averageEfficiency,
  consumptionByVehicleType,
  trends,
}) => {
  const vehicleTypeData = Object.entries(consumptionByVehicleType).map(([type, consumption]) => ({
    name: type,
    consumption: Number(consumption.toFixed(2)),
  }))

  const trendsData = trends.map((trend) => ({
    period: trend.period,
    consumption: Number(trend.consumption.toFixed(2)),
  }))

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="text-sm text-gray-500">Toplam Yakıt Tüketimi</div>
          <div className="text-2xl font-bold text-gray-900">
            {totalConsumption.toFixed(2)} L
          </div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-gray-500">Toplam Yakıt Maliyeti</div>
          <div className="text-2xl font-bold text-gray-900">
            {totalCost.toFixed(2)} ₺
          </div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-gray-500">Ortalama Verimlilik</div>
          <div className="text-2xl font-bold text-gray-900">
            {averageEfficiency.toFixed(2)} km/L
          </div>
        </div>
      </div>

      {/* Consumption Trends */}
      <div className="card p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Yakıt Tüketim Trendi</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={trendsData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="period" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="consumption"
              stroke="#3b82f6"
              strokeWidth={2}
              name="Tüketim (L)"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Consumption by Vehicle Type */}
      <div className="card p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Araç Tipine Göre Yakıt Tüketimi
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={vehicleTypeData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="consumption" fill="#f59e0b" name="Tüketim (L)" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

