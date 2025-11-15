from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime

class EmissionFactor(BaseModel):
    fuel_type: str
    co2_factor: float  # kg CO2 per liter
    nox_factor: Optional[float] = None  # kg NOx per liter
    pm_factor: Optional[float] = None   # kg PM per liter

class VehicleEmissionData(BaseModel):
    vehicle_id: str
    vehicle_type: str
    fuel_type: str
    engine_year: int
    euro_standard: Optional[str] = None
    fuel_consumption_data: List[Dict[str, Any]]

class EmissionEstimateRequest(BaseModel):
    vehicles: List[VehicleEmissionData]
    time_period: Dict[str, str]
    emission_factors: Optional[Dict[str, EmissionFactor]] = Field(
        default=None,
        description="Custom emission factors, defaults will be used if not provided"
    )
    include_indirect_emissions: bool = Field(
        default=False,
        description="Include upstream emissions from fuel production"
    )

class EmissionEstimateResponse(BaseModel):
    estimation_period: Dict[str, str]
    total_emissions: Dict[str, float] = Field(
        description="Total emissions by type (CO2, NOx, PM) in kg"
    )
    emissions_by_vehicle: Dict[str, Dict[str, float]]
    emissions_by_fuel_type: Dict[str, Dict[str, float]]
    daily_breakdown: List[Dict[str, Any]]
    benchmarks: Dict[str, float] = Field(
        description="Comparison with industry averages"
    )
    reduction_potential: Dict[str, float]

class CarbonFootprintRequest(BaseModel):
    municipality_data: Dict[str, Any] = Field(
        description="General municipality data like population, area, etc."
    )
    vehicle_fleet: List[VehicleEmissionData]
    buildings_energy: Optional[Dict[str, float]] = None
    waste_management: Optional[Dict[str, float]] = None
    time_period: Dict[str, str]

class CarbonFootprintResponse(BaseModel):
    total_carbon_footprint: float  # tons CO2 equivalent
    breakdown_by_sector: Dict[str, float]
    per_capita_emissions: float
    comparison_with_targets: Dict[str, float]
    reduction_recommendations: List[Dict[str, Any]]
    sustainability_score: float = Field(ge=0, le=100)

class EmissionReductionRequest(BaseModel):
    current_emissions: Dict[str, float]
    target_reduction_percentage: float = Field(ge=0, le=100)
    available_measures: List[Dict[str, Any]] = Field(
        description="Available reduction measures with costs and impact"
    )
    budget_constraint: Optional[float] = None
    time_horizon_years: int = Field(ge=1, le=20)

class EmissionReductionResponse(BaseModel):
    recommended_measures: List[Dict[str, Any]]
    projected_reduction: Dict[str, float]
    implementation_timeline: List[Dict[str, Any]]
    cost_benefit_analysis: Dict[str, float]
    monitoring_plan: List[Dict[str, Any]]
    risk_assessment: Dict[str, Any]