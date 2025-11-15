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

interface EmissionsChartProps {
  total: {
    CO2: number
    NOx?: number
    PM?: number
  }
  byFuelType: Record<string, { CO2: number }>
  byVehicleType: Record<string, {
    vehicleCount: number
    totalCO2: number
    averageCO2PerVehicle: number
  }>
  averagePerVehicle: number
}

const COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6']

export const EmissionsChart: React.FC<EmissionsChartProps> = ({
  total,
  byFuelType,
  byVehicleType,
  averagePerVehicle,
}) => {
  const fuelTypeData = Object.entries(byFuelType).map(([fuelType, data]) => ({
    name: fuelType,
    value: Number(data.CO2.toFixed(2)),
  }))

  const vehicleTypeData = Object.entries(byVehicleType).map(([type, data]) => ({
    name: type,
    totalCO2: Number(data.totalCO2.toFixed(2)),
    averageCO2: Number(data.averageCO2PerVehicle.toFixed(2)),
    vehicleCount: data.vehicleCount,
  }))

  const emissionTypes = [
    { name: 'CO2', value: Number(total.CO2.toFixed(2)), color: '#ef4444' },
    ...(total.NOx ? [{ name: 'NOx', value: Number(total.NOx.toFixed(2)), color: '#f59e0b' }] : []),
    ...(total.PM ? [{ name: 'PM', value: Number(total.PM.toFixed(2)), color: '#8b5cf6' }] : []),
  ]

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="text-sm text-gray-500">Toplam CO2</div>
          <div className="text-2xl font-bold text-red-600">
            {total.CO2.toFixed(2)} kg
          </div>
        </div>
        {total.NOx && (
          <div className="card p-4">
            <div className="text-sm text-gray-500">Toplam NOx</div>
            <div className="text-2xl font-bold text-orange-600">
              {total.NOx.toFixed(2)} kg
            </div>
          </div>
        )}
        {total.PM && (
          <div className="card p-4">
            <div className="text-sm text-gray-500">Toplam PM</div>
            <div className="text-2xl font-bold text-purple-600">
              {total.PM.toFixed(2)} kg
            </div>
          </div>
        )}
        <div className="card p-4">
          <div className="text-sm text-gray-500">Araç Başına Ortalama</div>
          <div className="text-2xl font-bold text-gray-900">
            {averagePerVehicle.toFixed(2)} kg CO2
          </div>
        </div>
      </div>

      {/* Emission Types Breakdown */}
      <div className="card p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Emisyon Türleri</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={emissionTypes}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="value" fill="#ef4444" name="Emisyon (kg)">
              {emissionTypes.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Emissions by Fuel Type */}
      <div className="card p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Yakıt Tipine Göre CO2 Emisyonu</h3>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={fuelTypeData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {fuelTypeData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Emissions by Vehicle Type */}
      <div className="card p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Araç Tipine Göre CO2 Emisyonu
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={vehicleTypeData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis yAxisId="left" />
            <YAxis yAxisId="right" orientation="right" />
            <Tooltip />
            <Legend />
            <Bar
              yAxisId="left"
              dataKey="totalCO2"
              fill="#ef4444"
              name="Toplam CO2 (kg)"
            />
            <Bar
              yAxisId="right"
              dataKey="averageCO2"
              fill="#f59e0b"
              name="Araç Başına Ortalama (kg)"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

