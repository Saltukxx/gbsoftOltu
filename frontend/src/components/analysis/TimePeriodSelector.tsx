import React from 'react'
import { ChevronDown } from 'lucide-react'
import type { TimePeriod } from '@/types'

interface TimePeriodSelectorProps {
  value: TimePeriod
  onChange: (period: TimePeriod) => void
}

const periodOptions: { value: TimePeriod; label: string }[] = [
  { value: 'today', label: 'Bugün' },
  { value: 'week', label: 'Bu Hafta' },
  { value: 'month', label: 'Bu Ay' },
  { value: 'quarter', label: 'Bu Çeyrek' },
]

export const TimePeriodSelector: React.FC<TimePeriodSelectorProps> = ({
  value,
  onChange,
}) => {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as TimePeriod)}
        className="appearance-none bg-white border border-gray-300 rounded-lg px-4 py-2 pr-10 text-sm font-medium text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer"
      >
        {periodOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
    </div>
  )
}

