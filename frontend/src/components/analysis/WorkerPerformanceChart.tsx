import React from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts'

interface WorkerPerformanceChartProps {
  performance: Array<{
    employeeId: string
    employeeName: string
    department: string
    totalShifts: number
    completedShifts: number
    completionRate: number
    averageEfficiency: number
    hoursWorked: number
    performanceScore: number
  }>
  averageCompletionRate: number
  averageEfficiencyScore: number
  totalHoursWorked: number
}

export const WorkerPerformanceChart: React.FC<WorkerPerformanceChartProps> = ({
  performance,
  averageCompletionRate,
  averageEfficiencyScore,
  totalHoursWorked,
}) => {
  // Top 10 performers by completion rate
  const topPerformers = [...performance]
    .sort((a, b) => b.completionRate - a.completionRate)
    .slice(0, 10)

  const completionData = topPerformers.map((emp) => ({
    name: emp.employeeName.split(' ')[0], // First name only for readability
    completionRate: Number(emp.completionRate.toFixed(1)),
    efficiency: Number(emp.averageEfficiency.toFixed(2)),
  }))

  // Performance by department
  const departmentStats = performance.reduce((acc, emp) => {
    if (!acc[emp.department]) {
      acc[emp.department] = {
        total: 0,
        totalCompletion: 0,
        totalEfficiency: 0,
        totalHours: 0,
      }
    }
    acc[emp.department].total += 1
    acc[emp.department].totalCompletion += emp.completionRate
    acc[emp.department].totalEfficiency += emp.averageEfficiency
    acc[emp.department].totalHours += emp.hoursWorked
    return acc
  }, {} as Record<string, { total: number; totalCompletion: number; totalEfficiency: number; totalHours: number }>)

  const departmentData = Object.entries(departmentStats).map(([dept, stats]) => ({
    name: dept,
    avgCompletionRate: Number((stats.totalCompletion / stats.total).toFixed(1)),
    avgEfficiency: Number((stats.totalEfficiency / stats.total).toFixed(2)),
    totalHours: stats.totalHours,
  }))

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="text-sm text-gray-500">Ortalama Tamamlanma Oranı</div>
          <div className="text-2xl font-bold text-gray-900">
            {averageCompletionRate.toFixed(1)}%
          </div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-gray-500">Ortalama Verimlilik Skoru</div>
          <div className="text-2xl font-bold text-gray-900">
            {averageEfficiencyScore.toFixed(2)}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-gray-500">Toplam Çalışılan Saat</div>
          <div className="text-2xl font-bold text-gray-900">{totalHoursWorked}</div>
        </div>
      </div>

      {/* Top Performers */}
      <div className="card p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          En İyi Performans Gösteren Çalışanlar
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={completionData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="completionRate" fill="#10b981" name="Tamamlanma Oranı (%)" />
            <Bar dataKey="efficiency" fill="#3b82f6" name="Verimlilik Skoru" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Department Performance */}
      <div className="card p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Departmana Göre Performans
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={departmentData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis yAxisId="left" />
            <YAxis yAxisId="right" orientation="right" />
            <Tooltip />
            <Legend />
            <Bar yAxisId="left" dataKey="avgCompletionRate" fill="#8b5cf6" name="Tamamlanma Oranı (%)" />
            <Bar yAxisId="right" dataKey="totalHours" fill="#f59e0b" name="Toplam Saat" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

