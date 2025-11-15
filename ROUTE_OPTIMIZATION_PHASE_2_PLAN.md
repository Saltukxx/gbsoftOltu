# Route Optimization - Phase 2 Implementation Plan

## Overview
This document outlines the implementation plan for advanced route optimization features:
- **Step 4**: Historical Route Analysis & Comparison
- **Step 5**: ML-Based Parameter Learning
- **Step 6**: Weather & Traffic Integration

---

## STEP 4: HISTORICAL ROUTE ANALYSIS

### Objective
Compare actual driven routes with optimized routes to measure real-world performance and identify optimization opportunities.

### 4.1 Database Schema Extensions

**New Tables:**

```sql
-- Route performance tracking
CREATE TABLE route_performance (
  id UUID PRIMARY KEY,
  vehicle_id UUID REFERENCES vehicles(id),
  optimized_route_id UUID REFERENCES optimized_routes(id),
  actual_route_id UUID REFERENCES vehicle_routes(id),

  -- Actual metrics
  actual_distance FLOAT,
  actual_time FLOAT,
  actual_fuel_cost FLOAT,

  -- Optimized metrics (for comparison)
  optimized_distance FLOAT,
  optimized_time FLOAT,
  optimized_fuel_cost FLOAT,

  -- Variance analysis
  distance_variance FLOAT,  -- (actual - optimized) / optimized
  time_variance FLOAT,
  fuel_variance FLOAT,

  -- Adherence score (0-100%)
  route_adherence_score FLOAT,

  -- Deviations
  num_deviations INT,
  deviation_details JSONB,  -- [{point, reason, distance_from_route}]

  -- Environmental factors
  weather_conditions JSONB,
  traffic_conditions JSONB,

  -- Notes
  driver_notes TEXT,
  deviation_reasons JSONB,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Route deviation events
CREATE TABLE route_deviations (
  id UUID PRIMARY KEY,
  route_performance_id UUID REFERENCES route_performance(id),
  deviation_type VARCHAR(50),  -- 'detour', 'skip', 'reorder', 'emergency'

  planned_location GEOGRAPHY(POINT),
  actual_location GEOGRAPHY(POINT),
  deviation_distance FLOAT,
  deviation_time FLOAT,

  reason VARCHAR(255),
  severity VARCHAR(20),  -- 'minor', 'moderate', 'major'

  timestamp TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Route insights (aggregated learnings)
CREATE TABLE route_insights (
  id UUID PRIMARY KEY,
  route_pattern_hash VARCHAR(64),  -- Hash of common route pattern

  -- Average performance
  avg_distance_variance FLOAT,
  avg_time_variance FLOAT,
  avg_fuel_variance FLOAT,
  avg_adherence_score FLOAT,

  -- Common issues
  common_deviations JSONB,
  problem_areas JSONB,  -- Geographic areas with frequent issues

  -- Recommendations
  recommended_algorithm VARCHAR(50),
  recommended_parameters JSONB,

  sample_size INT,
  last_updated TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_route_performance_vehicle ON route_performance(vehicle_id);
CREATE INDEX idx_route_performance_optimized ON route_performance(optimized_route_id);
CREATE INDEX idx_route_performance_date ON route_performance(created_at);
CREATE INDEX idx_route_deviations_performance ON route_deviations(route_performance_id);
```

### 4.2 Backend Services

**File: `backend/src/services/routeAnalysis/index.ts`**

```typescript
export class RouteAnalysisService {
  /**
   * Compare actual route with optimized route
   */
  async analyzeRoutePerformance(
    actualRouteId: string,
    optimizedRouteId: string
  ): Promise<RoutePerformanceAnalysis>

  /**
   * Calculate route adherence score
   * Based on how closely the actual route followed the optimized route
   */
  async calculateAdherenceScore(
    actualPath: [number, number][],
    optimizedPath: [number, number][]
  ): Promise<number>

  /**
   * Detect deviations from planned route
   */
  async detectDeviations(
    actualPath: [number, number][],
    optimizedPath: [number, number][]
  ): Promise<RouteDeviation[]>

  /**
   * Get aggregated insights for a vehicle
   */
  async getVehicleInsights(
    vehicleId: string,
    dateRange?: { from: Date; to: Date }
  ): Promise<VehicleInsights>

  /**
   * Generate route comparison report
   */
  async generateComparisonReport(
    routePerformanceId: string
  ): Promise<ComparisonReport>

  /**
   * Get best/worst performing routes
   */
  async getPerformanceLeaderboard(
    filters?: {
      vehicleId?: string
      dateRange?: { from: Date; to: Date }
      limit?: number
    }
  ): Promise<PerformanceLeaderboard>
}
```

### 4.3 API Endpoints

```
POST   /api/routes/analysis/compare
  - Compare actual vs optimized route
  - Body: { actualRouteId, optimizedRouteId }

GET    /api/routes/analysis/performance/:id
  - Get performance analysis details

GET    /api/routes/analysis/insights/:vehicleId
  - Get insights for specific vehicle

GET    /api/routes/analysis/leaderboard
  - Get performance rankings
  - Query: vehicleId, dateFrom, dateTo, limit

GET    /api/routes/analysis/deviations/:routePerformanceId
  - Get deviation details

POST   /api/routes/analysis/report
  - Generate comprehensive comparison report
```

### 4.4 Frontend Components

**File: `frontend/src/components/analysis/RouteComparisonDashboard.tsx`**

Features:
- Side-by-side route visualization (actual vs optimized)
- Metrics comparison table
- Deviation heatmap
- Performance trends over time
- Adherence score gauge
- Interactive deviation markers

**File: `frontend/src/components/analysis/PerformanceMetrics.tsx`**

Features:
- Distance/time/fuel variance charts
- Savings realization percentage
- Cost-benefit analysis
- ROI calculator

**File: `frontend/src/components/analysis/DeviationTimeline.tsx`**

Features:
- Chronological deviation events
- Reason categorization
- Severity indicators
- Driver notes display

---

## STEP 5: ML-BASED PARAMETER LEARNING

### Objective
Learn optimal optimization parameters from historical data to automatically suggest best settings for different route types.

### 5.1 Data Collection

**File: `backend/src/services/mlLearning/dataCollector.ts`**

```typescript
export class OptimizationDataCollector {
  /**
   * Collect training data from historical optimizations
   */
  async collectTrainingData(): Promise<TrainingDataset> {
    // Features:
    // - Route characteristics (num nodes, spread, density)
    // - Vehicle type
    // - Time of day, day of week
    // - Weather conditions
    // - Algorithm & parameters used
    // - Performance metrics (distance, time, fuel, adherence)

    return {
      features: [],
      labels: [],  // Performance scores
      metadata: []
    }
  }

  /**
   * Extract features from route
   */
  extractRouteFeatures(route: OptimizedRoute): FeatureVector

  /**
   * Calculate performance score (target variable)
   */
  calculatePerformanceScore(
    routePerformance: RoutePerformance
  ): number
}
```

### 5.2 ML Model

**File: `backend/src/services/mlLearning/parameterOptimizer.ts`**

```typescript
export class ParameterOptimizer {
  /**
   * Train model to predict optimal parameters
   * Uses Random Forest or Gradient Boosting
   */
  async trainModel(
    trainingData: TrainingDataset
  ): Promise<MLModel>

  /**
   * Predict optimal parameters for a route
   */
  async predictOptimalParameters(
    routeFeatures: FeatureVector
  ): Promise<OptimizationParameters>

  /**
   * Get parameter importance scores
   */
  getParameterImportance(): ParameterImportance

  /**
   * A/B test different parameter sets
   */
  async runABTest(
    route: Route,
    parameterSets: OptimizationParameters[]
  ): Promise<ABTestResults>
}
```

### 5.3 Parameter Recommendation System

**Database Table:**

```sql
CREATE TABLE parameter_recommendations (
  id UUID PRIMARY KEY,
  route_pattern_hash VARCHAR(64),

  -- Route characteristics
  num_nodes INT,
  avg_node_distance FLOAT,
  route_density FLOAT,

  -- Recommended parameters
  recommended_algorithm VARCHAR(50),
  recommended_priority_weight FLOAT,
  recommended_max_iterations INT,
  recommended_population_size INT,

  -- Confidence & performance
  confidence_score FLOAT,
  expected_improvement FLOAT,

  -- Model metadata
  model_version VARCHAR(20),
  training_samples INT,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 5.4 Auto-Tuning System

**File: `backend/src/services/mlLearning/autoTuner.ts`**

```typescript
export class AutoTuner {
  /**
   * Automatically tune parameters based on real-time feedback
   */
  async autoTuneParameters(
    vehicleId: string,
    historicalPerformance: RoutePerformance[]
  ): Promise<TunedParameters>

  /**
   * Adaptive parameter adjustment
   * Adjusts parameters based on recent performance
   */
  async adaptiveAdjustment(
    currentParams: OptimizationParameters,
    recentPerformance: RoutePerformance[]
  ): Promise<OptimizationParameters>

  /**
   * Bandit algorithm for exploration vs exploitation
   */
  async multiArmedBandit(
    route: Route
  ): Promise<OptimizationParameters>
}
```

### 5.5 API Endpoints

```
GET    /api/ml/recommend-parameters
  - Get recommended parameters for a route
  - Query: vehicleId, numNodes, avgDistance

POST   /api/ml/train
  - Trigger model retraining
  - Admin only

GET    /api/ml/model-stats
  - Get model performance statistics

POST   /api/ml/feedback
  - Submit feedback on parameter performance
  - Body: { optimizationId, actualPerformance, feedback }

GET    /api/ml/parameter-trends
  - Get trends in optimal parameters over time
```

### 5.6 Frontend Components

**File: `frontend/src/components/ml/ParameterRecommendations.tsx`**

Features:
- Recommended parameters display
- Confidence indicator
- Expected improvement estimate
- "Try recommended" button
- Parameter comparison charts

**File: `frontend/src/components/ml/ModelInsights.tsx`**

Features:
- Model accuracy metrics
- Feature importance visualization
- Parameter sensitivity analysis
- Training data statistics

---

## STEP 6: WEATHER & TRAFFIC INTEGRATION

### Objective
Adjust route optimization based on real-time weather and traffic conditions to provide more accurate time estimates and safer routes.

### 6.1 External API Integration

**File: `backend/src/services/externalData/weatherService.ts`**

```typescript
export class WeatherService {
  // Use OpenWeatherMap API

  /**
   * Get current weather for location
   */
  async getCurrentWeather(
    lat: number,
    lng: number
  ): Promise<WeatherData>

  /**
   * Get weather forecast along route
   */
  async getRouteForecast(
    path: [number, number][],
    startTime: Date
  ): Promise<RouteWeatherForecast>

  /**
   * Calculate weather impact on travel time
   */
  calculateWeatherImpact(
    weather: WeatherData,
    distance: number
  ): {
    speedReduction: number
    riskLevel: 'low' | 'medium' | 'high'
    recommendations: string[]
  }
}
```

**File: `backend/src/services/externalData/trafficService.ts`**

```typescript
export class TrafficService {
  // Use Mapbox Traffic API or Google Maps

  /**
   * Get current traffic conditions
   */
  async getTrafficConditions(
    path: [number, number][]
  ): Promise<TrafficData>

  /**
   * Get traffic-aware duration
   */
  async getTrafficAwareDuration(
    start: [number, number],
    end: [number, number],
    departureTime?: Date
  ): Promise<DurationEstimate>

  /**
   * Detect traffic incidents along route
   */
  async detectIncidents(
    path: [number, number][]
  ): Promise<TrafficIncident[]>

  /**
   * Get historical traffic patterns
   */
  async getHistoricalTraffic(
    location: [number, number],
    dayOfWeek: number,
    hour: number
  ): Promise<TrafficPattern>
}
```

### 6.2 Condition-Aware Optimization

**File: `backend/src/services/routeOptimization/conditionOptimizer.ts`**

```typescript
export class ConditionAwareOptimizer {
  /**
   * Adjust route based on weather conditions
   */
  async optimizeWithWeather(
    route: OptimizationRequest,
    weatherData: WeatherData
  ): Promise<OptimizationResult>

  /**
   * Adjust route based on traffic
   */
  async optimizeWithTraffic(
    route: OptimizationRequest,
    trafficData: TrafficData
  ): Promise<OptimizationResult>

  /**
   * Calculate condition-adjusted speeds
   */
  calculateAdjustedSpeeds(
    baseSpeed: number,
    weather: WeatherData,
    traffic: TrafficData
  ): number

  /**
   * Get route safety score
   */
  calculateSafetyScore(
    route: OptimizedRoute,
    conditions: {
      weather: WeatherData
      traffic: TrafficData
    }
  ): SafetyScore
}
```

### 6.3 Enhanced Constraints

```typescript
export interface WeatherConstraints {
  maxWindSpeed?: number          // km/h
  maxRainIntensity?: number      // mm/h
  maxSnowDepth?: number          // cm
  minVisibility?: number         // meters
  maxTemperature?: number        // °C
  minTemperature?: number        // °C
  avoidFlooding?: boolean
  avoidIce?: boolean
}

export interface TrafficConstraints {
  maxTrafficDelay?: number       // minutes
  avoidAccidents?: boolean
  avoidConstruction?: boolean
  avoidCongestion?: boolean
  preferredTrafficLevel?: 'low' | 'medium' | 'high'
}
```

### 6.4 Real-Time Updates

**File: `backend/src/services/realtimeUpdates/routeMonitor.ts`**

```typescript
export class RouteMonitor {
  /**
   * Monitor active routes for condition changes
   */
  async monitorActiveRoutes(): Promise<void>

  /**
   * Send alerts when conditions deteriorate
   */
  async sendConditionAlert(
    vehicleId: string,
    condition: 'weather' | 'traffic',
    severity: 'low' | 'medium' | 'high',
    details: any
  ): Promise<void>

  /**
   * Suggest route re-optimization
   */
  async suggestReOptimization(
    routeId: string,
    reason: string
  ): Promise<ReOptimizationSuggestion>

  /**
   * Get condition updates for route
   */
  async getRouteUpdates(
    routeId: string
  ): Promise<RouteUpdate[]>
}
```

### 6.5 Database Schema

```sql
-- Weather cache
CREATE TABLE weather_cache (
  id UUID PRIMARY KEY,
  location GEOGRAPHY(POINT),
  timestamp TIMESTAMP,

  temperature FLOAT,
  humidity FLOAT,
  pressure FLOAT,
  wind_speed FLOAT,
  wind_direction FLOAT,
  precipitation FLOAT,
  visibility FLOAT,
  conditions VARCHAR(50),

  raw_data JSONB,

  created_at TIMESTAMP DEFAULT NOW()
);

-- Traffic cache
CREATE TABLE traffic_cache (
  id UUID PRIMARY KEY,
  segment_start GEOGRAPHY(POINT),
  segment_end GEOGRAPHY(POINT),
  timestamp TIMESTAMP,

  speed_kmh FLOAT,
  congestion_level VARCHAR(20),
  travel_time_minutes FLOAT,
  incidents JSONB,

  raw_data JSONB,

  created_at TIMESTAMP DEFAULT NOW()
);

-- Route condition snapshots
CREATE TABLE route_condition_snapshots (
  id UUID PRIMARY KEY,
  optimized_route_id UUID REFERENCES optimized_routes(id),

  weather_summary JSONB,
  traffic_summary JSONB,

  average_speed_reduction FLOAT,
  total_delay_minutes FLOAT,
  safety_score FLOAT,

  timestamp TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_weather_location_time ON weather_cache
  USING GIST(location, timestamp);
CREATE INDEX idx_traffic_segment_time ON traffic_cache
  USING GIST(segment_start, timestamp);
```

### 6.6 API Endpoints

```
GET    /api/conditions/weather
  - Get current weather
  - Query: lat, lng

GET    /api/conditions/traffic
  - Get traffic conditions
  - Query: path (encoded polyline)

POST   /api/routes/optimize-with-conditions
  - Optimize route considering weather & traffic
  - Body: { route, includeWeather, includeTraffic }

GET    /api/routes/condition-alerts/:routeId
  - Get active condition alerts for route

POST   /api/routes/reoptimize-suggestion
  - Request re-optimization suggestion
  - Body: { routeId, currentLocation }

GET    /api/routes/safety-score/:routeId
  - Get current safety score
```

### 6.7 Frontend Components

**File: `frontend/src/components/conditions/WeatherLayer.tsx`**

Features:
- Weather overlay on map
- Temperature heatmap
- Precipitation visualization
- Wind direction arrows
- Weather icons at waypoints

**File: `frontend/src/components/conditions/TrafficLayer.tsx`**

Features:
- Traffic flow visualization (green/yellow/red)
- Incident markers
- Congestion heatmap
- Alternative route suggestions

**File: `frontend/src/components/conditions/ConditionAlerts.tsx`**

Features:
- Real-time condition alerts
- Severity indicators
- Re-optimization suggestions
- Safety warnings

**File: `frontend/src/components/conditions/SafetyScore.tsx`**

Features:
- Safety score gauge (0-100)
- Risk factors breakdown
- Recommendations
- Historical safety trends

---

## IMPLEMENTATION TIMELINE

### Phase 4: Historical Analysis (2-3 weeks)
**Week 1**: Database schema, backend services
**Week 2**: API endpoints, data collection
**Week 3**: Frontend dashboard, testing

### Phase 5: ML Learning (3-4 weeks)
**Week 1**: Data collection & feature engineering
**Week 2**: Model training & evaluation
**Week 3**: Parameter recommendation system
**Week 4**: Auto-tuning, A/B testing, frontend

### Phase 6: Weather & Traffic (2-3 weeks)
**Week 1**: External API integration
**Week 2**: Condition-aware optimizer
**Week 3**: Real-time monitoring, frontend

**Total Timeline**: 7-10 weeks

---

## TECHNICAL REQUIREMENTS

### APIs Needed:
- **OpenWeatherMap** (Free tier: 1000 calls/day)
- **Mapbox Traffic** (Included with Mapbox account)
- **Google Maps Traffic** (Alternative option)

### ML Libraries:
- **TensorFlow.js** or **Brain.js** for Node.js
- **Simple-Statistics** for basic analytics
- **ML.js** for Random Forest implementation

### Performance Considerations:
- Cache weather data (15-minute TTL)
- Cache traffic data (5-minute TTL)
- Async processing for ML training
- Background jobs for data collection

---

## SUCCESS METRICS

### Historical Analysis:
- ✅ Route adherence score > 85%
- ✅ Time variance < 10%
- ✅ Fuel savings realization > 80%

### ML Learning:
- ✅ Parameter prediction accuracy > 75%
- ✅ Performance improvement > 15%
- ✅ Auto-tuning convergence < 5 iterations

### Weather & Traffic:
- ✅ Weather-adjusted ETA accuracy > 90%
- ✅ Traffic delay prediction accuracy > 85%
- ✅ Safety score correlation with incidents > 0.7

---

## TESTING STRATEGY

1. **Unit Tests**: All service methods
2. **Integration Tests**: API endpoints
3. **E2E Tests**: Frontend workflows
4. **Performance Tests**: Load testing for ML predictions
5. **A/B Tests**: Compare routes with/without new features

---

## ROLLOUT PLAN

1. **Beta Testing**: Select 2-3 vehicles
2. **Pilot Program**: Expand to 10 vehicles
3. **Gradual Rollout**: 25% → 50% → 100%
4. **Monitoring**: Track metrics daily
5. **Feedback Loop**: Weekly reviews

---

## DOCUMENTATION NEEDS

- API documentation (Swagger)
- ML model documentation
- User guide for new features
- Admin guide for parameter tuning
- Troubleshooting guide

---

## NEXT ACTION ITEMS

1. Get API keys for weather/traffic services
2. Set up ML development environment
3. Create database migrations for new tables
4. Design UI mockups for dashboards
5. Plan sprint schedule with team
