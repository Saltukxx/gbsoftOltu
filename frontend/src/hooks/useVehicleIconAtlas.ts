import { useMemo } from 'react'

/**
 * Generates a canvas-based icon atlas for vehicle markers
 * Supports multiple vehicle states: normal, selected, offline
 * Returns the canvas element which deck.gl can use directly
 */
function generateVehicleIconAtlas(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null

  // Create canvas with space for 3 icons (192px wide, 64px tall)
  const canvas = document.createElement('canvas')
  canvas.width = 192 // 3 icons × 64px
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // Helper function to draw a vehicle icon at a specific x offset
  const drawVehicleIcon = (
    xOffset: number, 
    fillColor: string, 
    strokeColor?: string, 
    strokeWidth: number = 2
  ) => {
    // Draw vehicle body (triangle shape pointing up - car icon)
    ctx.fillStyle = fillColor
    ctx.beginPath()
    ctx.moveTo(xOffset + 32, 6)  // Top point (front of vehicle)
    ctx.lineTo(xOffset + 54, 52)  // Bottom right (back right)
    ctx.lineTo(xOffset + 10, 52) // Bottom left (back left)
    ctx.closePath()
    ctx.fill()

    // Draw border/stroke if provided
    if (strokeColor) {
      ctx.strokeStyle = strokeColor
      ctx.lineWidth = strokeWidth
      ctx.stroke()
    }

    // Draw windows (windshield and rear window)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(xOffset + 28, 24, 8, 20)  // Windshield
    ctx.fillRect(xOffset + 24, 40, 16, 6)  // Rear window
    
    // Add subtle shadow for depth
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)'
    ctx.fillRect(xOffset + 10, 50, 44, 4)
  }

  // Icon 1: Normal vehicle (blue) - default state
  drawVehicleIcon(0, '#2563eb')

  // Icon 2: Selected vehicle (brighter blue with prominent border)
  drawVehicleIcon(64, '#3b82f6', '#1e40af', 3)

  // Icon 3: Offline vehicle (gray) - inactive state
  drawVehicleIcon(128, '#9ca3af', '#6b7280', 2)

  return canvas
}

/**
 * Hook to manage vehicle icon atlas generation and cleanup
 * Uses useMemo to ensure the canvas is only created once
 */
export function useVehicleIconAtlas() {
  const iconAtlas = useMemo(() => {
    if (typeof document === 'undefined') {
      console.warn('useVehicleIconAtlas: document is undefined (SSR)')
      return null
    }
    
    const atlas = generateVehicleIconAtlas()
    if (!atlas) {
      console.error('useVehicleIconAtlas: Failed to generate icon atlas')
      return null
    }
    
    // Verify the atlas was created correctly
    if (atlas.width === 0 || atlas.height === 0) {
      console.error('useVehicleIconAtlas: Icon atlas has invalid dimensions')
      return null
    }
    
    return atlas
  }, []) // Empty deps - only create once

  return iconAtlas
}

