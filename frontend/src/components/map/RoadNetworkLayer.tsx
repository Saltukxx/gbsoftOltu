import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'

interface RoadNetworkLayerProps {
  map: mapboxgl.Map | null
  enabled: boolean
  style?: 'all' | 'major' | 'highways' // What type of roads to show
}

/**
 * RoadNetworkLayer - Adds a layer showing all roads in the map area
 * Uses Mapbox vector tiles to display road network
 */
export function useRoadNetworkLayer({
  map,
  enabled,
  style = 'all'
}: RoadNetworkLayerProps) {
  const layerAddedRef = useRef(false)
  const layerIdsRef = useRef<string[]>([])
  const sourceId = 'road-network-layer-source'

  useEffect(() => {
    if (!map || !enabled) {
      // Remove layers if disabled
      if (layerAddedRef.current && map) {
        try {
          // Remove all road network layers
          layerIdsRef.current.forEach(layerId => {
            if (map.getLayer(layerId)) {
              map.removeLayer(layerId)
            }
          })
          
          // Remove source if it exists
          if (map.getSource(sourceId)) {
            map.removeSource(sourceId)
          }
          
          layerIdsRef.current = []
        } catch (e) {
          // Ignore errors if layer doesn't exist
        }
        layerAddedRef.current = false
      }
      return
    }

    // Wait for map to be fully loaded and style loaded
    const addRoadLayerWhenReady = () => {
      if (!map.loaded() || !map.isStyleLoaded()) {
        return
      }
      
      addRoadLayer(map, style)
    }

    if (map.loaded() && map.isStyleLoaded()) {
      addRoadLayerWhenReady()
    } else {
      const onLoad = () => {
        if (map.isStyleLoaded()) {
          addRoadLayerWhenReady()
        } else {
          map.once('styledata', addRoadLayerWhenReady)
        }
      }
      
      if (!map.loaded()) {
        map.once('load', onLoad)
      } else {
        map.once('styledata', addRoadLayerWhenReady)
      }
    }

    function addRoadLayer(mapInstance: mapboxgl.Map, layerStyle: string) {
      // Skip if already added
      if (layerAddedRef.current) {
        // Check if layers still exist, if not re-add them
        const existingLayers = layerIdsRef.current.filter(id => mapInstance.getLayer(id))
        if (existingLayers.length === layerIdsRef.current.length) {
          return
        }
        // Some layers were removed, clean up and re-add
        layerIdsRef.current.forEach(id => {
          try {
            if (mapInstance.getLayer(id)) {
              mapInstance.removeLayer(id)
            }
          } catch (e) {
            // Ignore
          }
        })
        layerIdsRef.current = []
        layerAddedRef.current = false
      }

      try {
        // Add road network source using Mapbox Streets vector tiles
        if (!mapInstance.getSource(sourceId)) {
          mapInstance.addSource(sourceId, {
            type: 'vector',
            url: 'mapbox://mapbox.mapbox-streets-v8'
          })
        }

        // Add layers for different road types
        // Insert before any existing labels or symbols, but after route planner layers
        const roadLayers = getRoadLayers(layerStyle)
        const beforeLayer = findBeforeLayer(mapInstance)

        roadLayers.forEach((layerConfig, index) => {
          const layerId = `road-network-${index}`
          
          // Skip if layer already exists
          if (mapInstance.getLayer(layerId)) {
            layerIdsRef.current.push(layerId)
            return
          }
          
          try {
            mapInstance.addLayer({
              id: layerId,
              type: 'line',
              source: sourceId,
              'source-layer': layerConfig.sourceLayer,
              paint: {
                'line-color': layerConfig.color,
                'line-width': layerConfig.width,
                'line-opacity': layerConfig.opacity
              },
              filter: layerConfig.filter
            }, beforeLayer)
            
            layerIdsRef.current.push(layerId)
          } catch (error) {
            console.warn(`Failed to add road network layer ${layerId}:`, error)
          }
        })

        layerAddedRef.current = true
      } catch (error) {
        console.warn('Failed to add road network layer:', error)
        // Try alternative approach - enhance existing road layers
        enhanceExistingRoadLayers(mapInstance)
      }
    }

    function findBeforeLayer(mapInstance: mapboxgl.Map): string | undefined {
      // Find a good insertion point - before labels but after base layers
      // Avoid inserting before route planner or other custom layers
      const layers = mapInstance.getStyle().layers
      
      // Look for label layers (symbol type with label/text in ID)
      const labelLayer = layers.find(layer => 
        layer.type === 'symbol' && 
        (layer.id.includes('label') || layer.id.includes('text')) &&
        !layer.id.includes('road-network') // Exclude our own layers
      )
      
      // If no label layer found, look for any symbol layer
      if (!labelLayer) {
        const symbolLayer = layers.find(layer => 
          layer.type === 'symbol' &&
          !layer.id.includes('road-network')
        )
        return symbolLayer?.id
      }
      
      return labelLayer?.id
    }

    function enhanceExistingRoadLayers(mapInstance: mapboxgl.Map) {
      // Alternative: enhance visibility of existing road layers in the style
      try {
        const layers = mapInstance.getStyle().layers
        layers.forEach(layer => {
          if (layer.type === 'line' && 
              'source-layer' in layer && 
              layer['source-layer'] === 'road') {
            // Increase opacity and width of existing road layers
            mapInstance.setPaintProperty(layer.id, 'line-opacity', [
              'interpolate',
              ['linear'],
              ['zoom'],
              10, 0.4,
              13, 0.6,
              15, 0.8
            ])
          }
        })
      } catch (e) {
        // Ignore errors
      }
    }

    return () => {
      if (map && layerAddedRef.current) {
        try {
          // Remove all road network layers using stored IDs
          layerIdsRef.current.forEach(layerId => {
            try {
              if (map.getLayer(layerId)) {
                map.removeLayer(layerId)
              }
            } catch (e) {
              // Ignore cleanup errors for individual layers
            }
          })
          
          // Also check for any remaining layers with our prefix
          try {
            const layers = map.getStyle().layers
            layers.forEach((layer) => {
              if (layer.id.startsWith('road-network-')) {
                try {
                  map.removeLayer(layer.id)
                } catch (e) {
                  // Ignore
                }
              }
            })
          } catch (e) {
            // Ignore if style not loaded
          }
          
          // Remove source
          if (map.getSource(sourceId)) {
            map.removeSource(sourceId)
          }
          
          layerIdsRef.current = []
        } catch (e) {
          // Ignore cleanup errors
        }
        layerAddedRef.current = false
      }
    }
  }, [map, enabled, style])
}

/**
 * Get road layer configurations based on style
 */
function getRoadLayers(style: 'all' | 'major' | 'highways') {
  const baseLayers = [
    {
      sourceLayer: 'road',
      color: '#94a3b8',
      width: 1,
      opacity: 0.6,
      filter: ['match', ['get', 'class'], ['street', 'street_limited', 'primary_link', 'secondary_link', 'tertiary_link', 'trunk_link', 'service'], true, false]
    },
    {
      sourceLayer: 'road',
      color: '#64748b',
      width: 2,
      opacity: 0.7,
      filter: ['match', ['get', 'class'], ['tertiary', 'secondary'], true, false]
    },
    {
      sourceLayer: 'road',
      color: '#475569',
      width: 3,
      opacity: 0.8,
      filter: ['match', ['get', 'class'], ['primary', 'trunk'], true, false]
    },
    {
      sourceLayer: 'road',
      color: '#334155',
      width: 4,
      opacity: 0.9,
      filter: ['==', ['get', 'class'], 'motorway']
    }
  ]

  if (style === 'highways') {
    return baseLayers.filter((_, i) => i >= 2) // Only major roads
  } else if (style === 'major') {
    return baseLayers.filter((_, i) => i >= 1) // Secondary and above
  }

  return baseLayers // All roads
}

