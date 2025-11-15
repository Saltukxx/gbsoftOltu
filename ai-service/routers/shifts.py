from fastapi import APIRouter, HTTPException, BackgroundTasks
from typing import List, Dict, Any
import asyncio
import random
from datetime import datetime, timedelta

from schemas.shifts import (
    ShiftGenerateRequest, ShiftGenerateResponse, ShiftAssignment,
    ShiftAnalyzeRequest, ShiftAnalyzeResponse, OptimizationMetrics
)
from models.shift_optimizer import ShiftOptimizer
from utils.logger import logger

router = APIRouter()

# Initialize the shift optimizer
shift_optimizer = ShiftOptimizer()

@router.post("/generate", response_model=ShiftGenerateResponse)
async def generate_optimized_shifts(request: ShiftGenerateRequest):
    """
    Generate optimized shift schedule using AI algorithms.
    
    This endpoint uses a combination of:
    - Genetic Algorithm for global optimization
    - Timefold Solver for constraint satisfaction
    - Performance scoring based on historical data
    """
    try:
        logger.info(f"Generating shifts for {len(request.employees)} employees")
        
        # Validate request
        if not request.employees:
            raise HTTPException(status_code=400, detail="At least one employee is required")
        
        # Mock optimization process - In real implementation, this would call the actual optimization algorithms
        optimization_result = await shift_optimizer.optimize_shifts(
            employees=request.employees,
            constraints=request.constraints,
            period=request.period,
            optimize_for=request.optimize_for
        )
        
        logger.info(f"Shift optimization completed with efficiency score: {optimization_result.metrics.efficiency_score}")
        
        return optimization_result
        
    except Exception as e:
        logger.error(f"Error generating shifts: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Optimization failed: {str(e)}")

@router.post("/analyze", response_model=ShiftAnalyzeResponse)
async def analyze_shift_schedule(request: ShiftAnalyzeRequest):
    """
    Analyze existing shift schedule and provide recommendations.
    """
    try:
        logger.info("Analyzing existing shift schedule")
        
        analysis_result = await shift_optimizer.analyze_schedule(
            current_schedule=request.current_schedule,
            employees=request.employees,
            constraints=request.constraints
        )
        
        return analysis_result
        
    except Exception as e:
        logger.error(f"Error analyzing shifts: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

@router.get("/optimization-status/{task_id}")
async def get_optimization_status(task_id: str):
    """
    Get the status of a long-running optimization task.
    """
    try:
        # Mock status check - In real implementation, this would check task status from Redis or similar
        status = await shift_optimizer.get_task_status(task_id)
        return status
    except Exception as e:
        logger.error(f"Error getting task status: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get task status")

@router.post("/batch-optimize")
async def batch_optimize_multiple_periods(
    periods: List[Dict[str, Any]],
    background_tasks: BackgroundTasks
):
    """
    Optimize shifts for multiple time periods in the background.
    """
    try:
        task_id = f"batch_opt_{datetime.now().isoformat()}"
        
        # Add background task
        background_tasks.add_task(
            shift_optimizer.batch_optimize,
            task_id=task_id,
            periods=periods
        )
        
        return {
            "task_id": task_id,
            "status": "started",
            "message": f"Batch optimization started for {len(periods)} periods"
        }
        
    except Exception as e:
        logger.error(f"Error starting batch optimization: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to start batch optimization")

@router.get("/constraints/validate")
async def validate_constraints(
    max_hours_per_week: int = 40,
    min_rest_hours: int = 12,
    max_consecutive_days: int = 6
):
    """
    Validate shift constraints and return feasibility analysis.
    """
    try:
        validation_result = shift_optimizer.validate_constraints({
            "max_hours_per_week": max_hours_per_week,
            "min_rest_hours": min_rest_hours,
            "max_consecutive_days": max_consecutive_days
        })
        
        return validation_result
        
    except Exception as e:
        logger.error(f"Error validating constraints: {str(e)}")
        raise HTTPException(status_code=500, detail="Constraint validation failed")

@router.get("/performance/metrics")
async def get_performance_metrics(period_days: int = 30):
    """
    Get performance metrics for shift optimization over a specified period.
    """
    try:
        metrics = await shift_optimizer.get_performance_metrics(period_days)
        return metrics
    except Exception as e:
        logger.error(f"Error getting performance metrics: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get performance metrics")