import { useEffect, useRef, useState, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import { MapboxOverlay } from '@deck.gl/mapbox'
import type { Layer } from '@deck.gl/core'
import { devLog } from '@/utils/logger'

interface UseMapboxWithDeckOptions {
  containerRef: React.RefObject<HTMLDivElement>
  center?: [number, number]
  zoom?: number
  onMapLoad?: (map: mapboxgl.Map) => void
  onError?: (error: Error) => void
}

interface UseMapboxWithDeckReturn {
  map: React.MutableRefObject<mapboxgl.Map | null>
  overlay: React.MutableRefObject<MapboxOverlay | null>
  mapLoaded: boolean
  updateLayers: (layers: Layer[]) => void
}

/**
 * Hook to initialize Mapbox GL JS map with Deck.gl MapboxOverlay
 * Manages map lifecycle, overlay attachment, and layer updates
 */
export function useMapboxWithDeck({
  containerRef,
  center = [41.987, 40.540], // Oltu, Erzurum default
  zoom = 13,
  onMapLoad,
  onError
}: UseMapboxWithDeckOptions): UseMapboxWithDeckReturn {
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const overlayRef = useRef<MapboxOverlay | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [containerReady, setContainerReady] = useState(false)
  const loadTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const initAttemptRef = useRef(false)
  
  // Use refs for callbacks to avoid re-initialization when callbacks change
  const onMapLoadRef = useRef(onMapLoad)
  const onErrorRef = useRef(onError)
  
  // Update refs when callbacks change
  useEffect(() => {
    onMapLoadRef.current = onMapLoad
    onErrorRef.current = onError
  }, [onMapLoad, onError])

  // Check if container is ready - use a polling approach to avoid dependency issues
  useEffect(() => {
    let mounted = true
    
    const checkContainer = () => {
      if (!mounted) return
      const isReady = !!containerRef.current
      setContainerReady(prev => {
        if (prev !== isReady) {
          devLog.log('Container ready state changed:', isReady)
          return isReady
        }
        return prev
      })
    }

    // Check immediately
    checkContainer()

    // Poll periodically to catch when container becomes available
    const interval = setInterval(checkContainer, 100)
    
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, []) // Empty deps - we're polling

  // Initialize map and overlay
  useEffect(() => {
    // Wait for container to be available
    if (!containerReady || !containerRef.current) {
      devLog.log('Waiting for container to be ready...', { containerReady, hasRef: !!containerRef.current })
      return
    }

    // Don't reinitialize if map already exists or initialization already attempted
    if (mapRef.current) {
      devLog.log('Map already exists, skipping initialization')
      return
    }
    
    if (initAttemptRef.current) {
      devLog.log('Map initialization already attempted, skipping')
      return
    }

    devLog.log('Starting map initialization...')
    initAttemptRef.current = true

    const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN
    if (!token || token.includes('your-') || token.includes('token-here')) {
      const error = new Error('Mapbox token is missing or invalid')
      devLog.error('Mapbox token validation failed:', token)
      onErrorRef.current?.(error)
      initAttemptRef.current = false // Reset so we can retry
      return
    }

    const containerRect = containerRef.current.getBoundingClientRect()
    devLog.log('Initializing Mapbox map...', {
      containerSize: { width: containerRect.width, height: containerRect.height },
      token: token.substring(0, 20) + '...',
      containerExists: !!containerRef.current
    })

    if (containerRect.width === 0 || containerRect.height === 0) {
      devLog.warn('Map container has no dimensions - map may not render properly, but continuing...')
      // Continue anyway - Mapbox can handle this
    }

    try {
      // Create Mapbox map
      mapRef.current = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center,
        zoom,
        accessToken: token
      })

      // Handle map load event
      mapRef.current.on('load', () => {
        devLog.log('Map loaded successfully')

        if (loadTimeoutRef.current) {
          clearTimeout(loadTimeoutRef.current)
          loadTimeoutRef.current = null
        }

        try {
          if (mapRef.current) {
            // Disable rotation for better UX
            mapRef.current.dragRotate.disable()
            mapRef.current.touchZoomRotate.disableRotation()

            // Create and attach Deck.gl overlay
            if (!overlayRef.current) {
              overlayRef.current = new MapboxOverlay({ layers: [] })
              mapRef.current.addControl(overlayRef.current)
            }
          }
        } catch (err) {
          devLog.warn('Could not configure map controls:', err)
        }

        setMapLoaded(true)
        onMapLoadRef.current?.(mapRef.current)
      })

      // Handle map errors
      mapRef.current.on('error', (e: any) => {
        devLog.error('Mapbox error:', e)
        setMapLoaded(false)

        if (loadTimeoutRef.current) {
          clearTimeout(loadTimeoutRef.current)
          loadTimeoutRef.current = null
        }

        const error = new Error(
          e.error?.message?.includes('token') || e.error?.message?.includes('unauthorized')
            ? 'Mapbox token geçersiz veya yetkisiz'
            : e.error?.message || 'Bilinmeyen hata'
        )
        onErrorRef.current?.(error)
      })

      // Fallback timeout
      loadTimeoutRef.current = setTimeout(() => {
        if (mapRef.current) {
          devLog.warn('Map load timeout - checking if map is actually loaded')
          if (mapRef.current.isStyleLoaded()) {
            devLog.log('Map style is loaded, setting mapLoaded to true')
            setMapLoaded(true)
            onMapLoadRef.current?.(mapRef.current)
          } else {
            devLog.error('Map failed to load within timeout')
            const error = new Error('Harita yüklenemedi - Zaman aşımı')
            onErrorRef.current?.(error)
          }
        }
      }, 10000)
    } catch (err: any) {
      devLog.error('Failed to initialize Mapbox:', err)
      const error = new Error(err.message || 'Bilinmeyen hata')
      setMapLoaded(false)
      onErrorRef.current?.(error)
    }

    // Cleanup function
    return () => {
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current)
      }
      if (overlayRef.current && mapRef.current) {
        mapRef.current.removeControl(overlayRef.current)
      }
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
        setMapLoaded(false)
      }
      overlayRef.current = null
      initAttemptRef.current = false
    }
  }, [containerReady, center, zoom])

  // Update layers function
  const prevLayerIdsRef = useRef<string>('')
  const updateLayers = useCallback((layers: Layer[]) => {
    if (!mapLoaded) {
      return
    }
    if (!overlayRef.current) {
      devLog.warn('Deck.gl overlay not initialized, cannot update layers')
      return
    }
    
    // Only log when layer IDs change
    const layerIds = layers.map(l => l.id).join(',')
    if (layerIds !== prevLayerIdsRef.current) {
      devLog.log(`Updating deck.gl layers: ${layers.length} layers`, layers.map(l => l.id))
      prevLayerIdsRef.current = layerIds
    }
    
    try {
      overlayRef.current.setProps({ layers })
    } catch (error) {
      devLog.error('Error updating deck.gl layers:', error)
    }
  }, [mapLoaded])

  return {
    map: mapRef,
    overlay: overlayRef,
    mapLoaded,
    updateLayers
  }
}

