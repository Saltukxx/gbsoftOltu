from fastapi import APIRouter, HTTPException, BackgroundTasks
from typing import List, Dict, Any
from datetime import datetime

from schemas.emissions import (
    EmissionEstimateRequest, EmissionEstimateResponse,
    CarbonFootprintRequest, CarbonFootprintResponse,
    EmissionReductionRequest, EmissionReductionResponse
)
from models.emission_estimator import EmissionEstimator
from utils.logger import logger

router = APIRouter()

# Initialize the emission estimator
emission_estimator = EmissionEstimator()

@router.post("/estimate", response_model=EmissionEstimateResponse)
async def estimate_emissions(request: EmissionEstimateRequest):
    """
    Estimate emissions from vehicle fleet operations.
    
    Calculates:
    - CO2 emissions from fuel consumption
    - NOx and PM emissions (if applicable)
    - Breakdown by vehicle type and fuel type
    - Daily/weekly trends
    """
    try:
        logger.info(f"Estimating emissions for {len(request.vehicles)} vehicles")
        
        if not request.vehicles:
            raise HTTPException(status_code=400, detail="At least one vehicle is required")
        
        estimation_result = await emission_estimator.estimate_emissions(
            vehicles=request.vehicles,
            time_period=request.time_period,
            emission_factors=request.emission_factors,
            include_indirect_emissions=request.include_indirect_emissions
        )
        
        total_co2 = estimation_result.total_emissions.get('CO2', 0)
        logger.info(f"Emission estimation completed: {total_co2:.2f} kg CO2")
        
        return estimation_result
        
    except Exception as e:
        logger.error(f"Error estimating emissions: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Emission estimation failed: {str(e)}")

@router.post("/carbon-footprint", response_model=CarbonFootprintResponse)
async def calculate_carbon_footprint(request: CarbonFootprintRequest):
    """
    Calculate comprehensive carbon footprint for the municipality.
    """
    try:
        logger.info("Calculating municipality carbon footprint")
        
        footprint_result = await emission_estimator.calculate_carbon_footprint(
            municipality_data=request.municipality_data,
            vehicle_fleet=request.vehicle_fleet,
            time_period=request.time_period,
            buildings_energy=request.buildings_energy,
            waste_management=request.waste_management
        )
        
        logger.info(f"Carbon footprint calculated: {footprint_result.total_carbon_footprint:.2f} tons CO2e")
        
        return footprint_result
        
    except Exception as e:
        logger.error(f"Error calculating carbon footprint: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Carbon footprint calculation failed: {str(e)}")

@router.post("/reduction-plan", response_model=EmissionReductionResponse)
async def create_emission_reduction_plan(request: EmissionReductionRequest):
    """
    Create an emission reduction plan with cost-benefit analysis.
    """
    try:
        logger.info(f"Creating emission reduction plan for {request.target_reduction_percentage}% reduction")
        
        reduction_plan = await emission_estimator.create_reduction_plan(
            current_emissions=request.current_emissions,
            target_reduction_percentage=request.target_reduction_percentage,
            available_measures=request.available_measures,
            budget_constraint=request.budget_constraint,
            time_horizon_years=request.time_horizon_years
        )
        
        return reduction_plan
        
    except Exception as e:
        logger.error(f"Error creating reduction plan: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Reduction plan creation failed: {str(e)}")

@router.get("/benchmarks")
async def get_emission_benchmarks(
    municipality_size: str = "medium",  # small, medium, large
    country: str = "turkey",
    include_international: bool = True
):
    """
    Get emission benchmarks for comparison.
    """
    try:
        benchmarks = await emission_estimator.get_benchmarks(
            municipality_size=municipality_size,
            country=country,
            include_international=include_international
        )
        return benchmarks
        
    except Exception as e:
        logger.error(f"Error getting benchmarks: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get emission benchmarks")

@router.get("/factors")
async def get_emission_factors(
    region: str = "turkey",
    fuel_types: List[str] = None
):
    """
    Get current emission factors for different fuel types and regions.
    """
    try:
        factors = await emission_estimator.get_emission_factors(
            region=region,
            fuel_types=fuel_types
        )
        return factors
        
    except Exception as e:
        logger.error(f"Error getting emission factors: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get emission factors")

@router.post("/monitoring/setup")
async def setup_emission_monitoring(
    vehicles: List[str],
    monitoring_frequency: str = "daily",  # hourly, daily, weekly
    alert_thresholds: Dict[str, float] = None
):
    """
    Set up automated emission monitoring and alerts.
    """
    try:
        monitoring_config = await emission_estimator.setup_monitoring(
            vehicles=vehicles,
            monitoring_frequency=monitoring_frequency,
            alert_thresholds=alert_thresholds
        )
        
        return {
            "message": "Emission monitoring configured successfully",
            "config": monitoring_config,
            "vehicles_monitored": len(vehicles)
        }
        
    except Exception as e:
        logger.error(f"Error setting up monitoring: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to setup emission monitoring")

@router.get("/reports/sustainability")
async def generate_sustainability_report(
    time_period: Dict[str, str],
    include_charts: bool = True,
    format: str = "json"  # json, pdf, excel
):
    """
    Generate comprehensive sustainability report.
    """
    try:
        report = await emission_estimator.generate_sustainability_report(
            time_period=time_period,
            include_charts=include_charts,
            format=format
        )
        
        return report
        
    except Exception as e:
        logger.error(f"Error generating sustainability report: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to generate sustainability report")

@router.get("/predictions/trends")
async def predict_emission_trends(
    years_ahead: int = 5,
    scenarios: List[str] = None  # baseline, optimistic, pessimistic
):
    """
    Predict future emission trends based on current patterns and scenarios.
    """
    try:
        if scenarios is None:
            scenarios = ["baseline"]
            
        predictions = await emission_estimator.predict_emission_trends(
            years_ahead=years_ahead,
            scenarios=scenarios
        )
        
        return predictions
        
    except Exception as e:
        logger.error(f"Error predicting emission trends: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to predict emission trends")
