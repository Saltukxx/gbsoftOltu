from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime

class VehicleData(BaseModel):
    id: str
    plate_number: str
    vehicle_type: str
    fuel_type: str
    fuel_capacity: float
    year: int
    model: str

class HistoricalFuelData(BaseModel):
    date: str
    fuel_consumed: float
    distance_traveled: float
    avg_speed: Optional[float] = None
    engine_hours: Optional[float] = None
    route_type: Optional[str] = None  # urban, highway, mixed
    weather_condition: Optional[str] = None

class FuelPredictionRequest(BaseModel):
    vehicle: VehicleData
    historical_data: List[HistoricalFuelData]
    prediction_period: Dict[str, str] = Field(
        description="Period with start_date and end_date for prediction"
    )
    planned_routes: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="Planned routes with distance and route type"
    )
    external_factors: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Weather, traffic, maintenance schedule, etc."
    )

class FuelPredictionResponse(BaseModel):
    vehicle_id: str
    prediction_period: Dict[str, str]
    predicted_consumption: float
    consumption_breakdown: Dict[str, float] = Field(
        description="Daily or weekly breakdown of predicted consumption"
    )
    confidence_interval: Dict[str, float] = Field(
        description="Lower and upper bounds of prediction"
    )
    efficiency_metrics: Dict[str, float]
    recommendations: List[str]
    cost_estimation: Optional[Dict[str, float]] = None

class FuelAnalyzeRequest(BaseModel):
    vehicles: List[VehicleData]
    time_period: Dict[str, str]
    fuel_price_per_liter: Optional[float] = None

class FuelAnalyzeResponse(BaseModel):
    analysis_period: Dict[str, str]
    fleet_summary: Dict[str, Any]
    vehicle_rankings: Dict[str, List[Dict[str, Any]]] = Field(
        description="Rankings by efficiency, cost, emissions, etc."
    )
    optimization_opportunities: List[Dict[str, Any]]
    cost_breakdown: Dict[str, float]
    trends: Dict[str, Any]

class FuelOptimizationRequest(BaseModel):
    vehicles: List[VehicleData]
    routes: List[Dict[str, Any]]
    constraints: Dict[str, Any] = Field(
        description="Constraints like max fuel budget, maintenance windows, etc."
    )
    optimization_goal: str = Field(
        default="cost",
        description="Optimization target: 'cost', 'efficiency', or 'emissions'"
    )

class FuelOptimizationResponse(BaseModel):
    optimized_assignments: List[Dict[str, Any]]
    expected_savings: Dict[str, float]
    implementation_plan: List[Dict[str, Any]]
    monitoring_recommendations: List[str]