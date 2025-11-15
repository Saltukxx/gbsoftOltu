import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MiniTrendChart } from '../MiniTrendChart'

describe('MiniTrendChart', () => {
  it('renders svg trend with provided points', () => {
    const points = [
      { label: 'Mon', value: 10 },
      { label: 'Tue', value: 15 },
      { label: 'Wed', value: 5 },
    ]

    render(<MiniTrendChart points={points} ariaLabel="Trend test" />)

    const svg = screen.getByRole('img', { name: /trend test/i })
    expect(svg).toBeInTheDocument()
    expect(svg.querySelectorAll('circle')).toHaveLength(points.length)
  })

  it('shows fallback when no data', () => {
    render(<MiniTrendChart points={[]} />)
    expect(screen.getByText(/veri yok/i)).toBeInTheDocument()
  })
})
