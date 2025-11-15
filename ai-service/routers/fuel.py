from fastapi import APIRouter, HTTPException, BackgroundTasks
from typing import List, Dict, Any
import asyncio
from datetime import datetime

from schemas.fuel import (
    FuelPredictionRequest, FuelPredictionResponse,
    FuelAnalyzeRequest, FuelAnalyzeResponse,
    FuelOptimizationRequest, FuelOptimizationResponse
)
from models.fuel_predictor import FuelPredictor
from utils.logger import logger

router = APIRouter()

# Initialize the fuel predictor
fuel_predictor = FuelPredictor()

@router.post("/predict", response_model=FuelPredictionResponse)
async def predict_fuel_consumption(request: FuelPredictionRequest):
    """
    Predict fuel consumption for a vehicle using machine learning models.
    
    Uses XGBoost regression model with features:
    - Historical fuel consumption patterns
    - Vehicle characteristics (type, age, engine)
    - Route characteristics (distance, type, traffic)
    - External factors (weather, maintenance status)
    """
    try:
        logger.info(f"Predicting fuel consumption for vehicle {request.vehicle.id}")
        
        if not request.historical_data:
            raise HTTPException(status_code=400, detail="Historical data is required for prediction")
        
        prediction_result = await fuel_predictor.predict_consumption(
            vehicle=request.vehicle,
            historical_data=request.historical_data,
            prediction_period=request.prediction_period,
            planned_routes=request.planned_routes,
            external_factors=request.external_factors
        )
        
        logger.info(f"Fuel prediction completed for vehicle {request.vehicle.id}: {prediction_result.predicted_consumption:.2f}L")
        
        return prediction_result
        
    except Exception as e:
        logger.error(f"Error predicting fuel consumption: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")

@router.post("/analyze", response_model=FuelAnalyzeResponse)
async def analyze_fuel_efficiency(request: FuelAnalyzeRequest):
    """
    Analyze fuel efficiency across the vehicle fleet.
    """
    try:
        logger.info(f"Analyzing fuel efficiency for {len(request.vehicles)} vehicles")
        
        analysis_result = await fuel_predictor.analyze_fleet_efficiency(
            vehicles=request.vehicles,
            time_period=request.time_period,
            fuel_price_per_liter=request.fuel_price_per_liter
        )
        
        return analysis_result
        
    except Exception as e:
        logger.error(f"Error analyzing fuel efficiency: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

@router.post("/optimize", response_model=FuelOptimizationResponse)
async def optimize_fuel_usage(request: FuelOptimizationRequest):
    """
    Optimize fuel usage across vehicles and routes.
    """
    try:
        logger.info(f"Optimizing fuel usage for {len(request.vehicles)} vehicles")
        
        optimization_result = await fuel_predictor.optimize_fuel_usage(
            vehicles=request.vehicles,
            routes=request.routes,
            constraints=request.constraints,
            optimization_goal=request.optimization_goal
        )
        
        return optimization_result
        
    except Exception as e:
        logger.error(f"Error optimizing fuel usage: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Optimization failed: {str(e)}")

@router.get("/efficiency/rankings")
async def get_efficiency_rankings(
    time_period_days: int = 30,
    vehicle_type: str = None,
    fuel_type: str = None
):
    """
    Get vehicle efficiency rankings based on historical data.
    """
    try:
        rankings = await fuel_predictor.get_efficiency_rankings(
            time_period_days=time_period_days,
            vehicle_type=vehicle_type,
            fuel_type=fuel_type
        )
        return rankings
        
    except Exception as e:
        logger.error(f"Error getting efficiency rankings: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get efficiency rankings")

@router.get("/consumption/trends")
async def get_consumption_trends(
    vehicle_id: str = None,
    period: str = "month",  # day, week, month, year
    include_forecast: bool = True
):
    """
    Get fuel consumption trends with optional forecasting.
    """
    try:
        trends = await fuel_predictor.get_consumption_trends(
            vehicle_id=vehicle_id,
            period=period,
            include_forecast=include_forecast
        )
        return trends
        
    except Exception as e:
        logger.error(f"Error getting consumption trends: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get consumption trends")

@router.post("/models/retrain")
async def retrain_prediction_models(background_tasks: BackgroundTasks):
    """
    Trigger retraining of fuel prediction models with latest data.
    """
    try:
        task_id = f"retrain_{datetime.now().isoformat()}"
        
        background_tasks.add_task(
            fuel_predictor.retrain_models,
            task_id=task_id
        )
        
        return {
            "task_id": task_id,
            "status": "started",
            "message": "Model retraining started"
        }
        
    except Exception as e:
        logger.error(f"Error starting model retraining: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to start model retraining")

@router.get("/models/performance")
async def get_model_performance():
    """
    Get performance metrics of current fuel prediction models.
    """
    try:
        performance = await fuel_predictor.get_model_performance()
        return performance
        
    except Exception as e:
        logger.error(f"Error getting model performance: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get model performance")