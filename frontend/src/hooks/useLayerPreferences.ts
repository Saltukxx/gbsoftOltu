import { useState, useEffect } from 'react'

interface LayerPreferences {
  showVehicleLayer: boolean
  showRouteLayer: boolean
  showTripsLayer: boolean
  showRoadNetwork: boolean
}

const STORAGE_KEY = 'vehicle-map-layer-preferences'

const DEFAULT_PREFERENCES: LayerPreferences = {
  showVehicleLayer: true,
  showRouteLayer: true,
  showTripsLayer: false,
  showRoadNetwork: true
}

/**
 * Hook to persist and restore layer visibility preferences
 */
export function useLayerPreferences() {
  const [preferences, setPreferences] = useState<LayerPreferences>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) }
      }
    } catch (error) {
      console.warn('Failed to load layer preferences:', error)
    }
    return DEFAULT_PREFERENCES
  })

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
    } catch (error) {
      console.warn('Failed to save layer preferences:', error)
    }
  }, [preferences])

  return {
    preferences,
    setPreferences,
    updatePreference: <K extends keyof LayerPreferences>(
      key: K,
      value: LayerPreferences[K]
    ) => {
      setPreferences((prev) => ({ ...prev, [key]: value }))
    }
  }
}

