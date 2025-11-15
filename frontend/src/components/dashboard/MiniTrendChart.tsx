import React from 'react'
import clsx from 'clsx'

export interface MiniTrendPoint {
  label: string
  value: number
}

interface MiniTrendChartProps {
  points: MiniTrendPoint[]
  height?: number
  strokeWidth?: number
  colorClass?: string
  ariaLabel?: string
}

export const MiniTrendChart: React.FC<MiniTrendChartProps> = ({
  points,
  height = 80,
  strokeWidth = 2,
  colorClass = 'text-blue-500',
  ariaLabel = 'Trend grafiği'
}) => {
  if (!points.length) {
    return (
      <div className="h-20 flex items-center justify-center text-sm text-gray-400">
        Veri yok
      </div>
    )
  }

  const width = 240
  const values = points.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  const normalizedPoints = points.map((point, index) => {
    const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width
    const y = height - ((point.value - min) / range) * height
    return { x, y }
  })

  const polylinePoints = normalizedPoints.map((p) => `${p.x},${p.y}`).join(' ')

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-20"
        role="img"
        aria-label={ariaLabel}
      >
        <defs>
          <linearGradient id="trend-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.3" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d={`M0,${height} L${polylinePoints} L${width},${height} Z`}
          fill="url(#trend-gradient)"
          className={clsx(colorClass)}
        />
        <polyline
          points={polylinePoints}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={clsx(colorClass)}
        />
        {normalizedPoints.map((point, idx) => (
          <circle
            key={`point-${idx}`}
            cx={point.x}
            cy={point.y}
            r={3}
            className={clsx(colorClass, 'fill-current')}
          >
            <title>{`${points[idx].label}: ${points[idx].value}`}</title>
          </circle>
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-xs text-gray-500">
        <span>{points[0].label}</span>
        <span>{points[points.length - 1].label}</span>
      </div>
    </div>
  )
}

export default MiniTrendChart
