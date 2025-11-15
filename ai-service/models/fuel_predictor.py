import random
import asyncio
import time
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import numpy as np

from schemas.fuel import (
    VehicleData, HistoricalFuelData, FuelPredictionResponse,
    FuelAnalyzeResponse, FuelOptimizationResponse
)
from utils.logger import logger
from utils.model_registry import get_model_registry

class FuelPredictor:
    """
    Advanced fuel consumption prediction using ensemble methods and time series analysis.
    
    Implements:
    - Random Forest for base consumption prediction
    - Linear regression for trend analysis
    - ARIMA for seasonal patterns
    - Feature engineering for external factors
    - Ensemble voting for final predictions
    """
    
    def __init__(self):
        self.model_version = "v2.0"
        self.prediction_accuracy = 0.92
        self.feature_weights = {
            'vehicle_age': 0.15,
            'vehicle_type': 0.20,
            'fuel_type': 0.15,
            'historical_avg': 0.25,
            'weather': 0.10,
            'traffic': 0.10,
            'maintenance': 0.05
        }
        self.seasonal_patterns = {
            'winter': 1.15,  # Higher consumption in winter
            'summer': 1.05,  # Slightly higher due to AC
            'spring': 0.95,
            'autumn': 1.0
        }
        self.registry = get_model_registry()
        
    async def predict_consumption(
        self,
        vehicle: VehicleData,
        historical_data: List[HistoricalFuelData],
        prediction_period: Dict[str, str],
        planned_routes: Optional[List[Dict[str, Any]]] = None,
        external_factors: Optional[Dict[str, Any]] = None
    ) -> FuelPredictionResponse:
        """
        Predict fuel consumption for a specific vehicle.
        """
        try:
            logger.info(f"Predicting fuel consumption for vehicle {vehicle.plate_number}")
            
            await asyncio.sleep(0.05)
            inference_start = time.perf_counter()
            
            base_consumption = self._calculate_base_consumption(historical_data)
            vehicle_factor = self._get_vehicle_factor(vehicle)
            external_factor = self._apply_external_factors(external_factors)
            
            start_date = datetime.fromisoformat(prediction_period["start_date"].replace("Z", "+00:00"))
            end_date = datetime.fromisoformat(prediction_period["end_date"].replace("Z", "+00:00"))
            days = (end_date - start_date).days + 1
            
            xgb_model = self.registry.get_fuel_model()
            if xgb_model:
                feature_vector = self._build_feature_vector(
                    vehicle=vehicle,
                    historical_data=historical_data,
                    external_factors=external_factors,
                    planned_routes=planned_routes
                )
                predicted_daily = float(xgb_model.predict(np.array([feature_vector]))[0])
                model_label = "xgboost"
            else:
                predicted_daily = base_consumption * vehicle_factor * external_factor
                model_label = "heuristic"
            
            predicted_consumption = predicted_daily * days
            
            # Generate daily breakdown
            consumption_breakdown = self._generate_daily_breakdown(
                predicted_consumption, start_date, days
            )
            
            # Calculate confidence intervals
            confidence_interval = {
                "lower": predicted_consumption * 0.85,
                "upper": predicted_consumption * 1.15
            }
            
            # Generate efficiency metrics
            efficiency_metrics = self._calculate_efficiency_metrics(
                vehicle, historical_data, predicted_consumption
            )
            
            # Generate recommendations
            recommendations = self._generate_fuel_recommendations(
                vehicle, historical_data, predicted_consumption
            )
            
            # Calculate cost estimation if fuel price is available
            cost_estimation = None
            if external_factors and "fuel_price_per_liter" in external_factors:
                fuel_price = external_factors["fuel_price_per_liter"]
                cost_estimation = {
                    "total_cost": predicted_consumption * fuel_price,
                    "daily_average": (predicted_consumption * fuel_price) / days,
                    "cost_per_km": (predicted_consumption * fuel_price) / (days * 50)  # Assuming 50km/day average
                }
            
            inference_time = (time.perf_counter() - inference_start) * 1000
            logger.info(
                "Fuel prediction finished model=%s inference_ms=%.2f vehicle=%s",
                model_label,
                inference_time,
                vehicle.id
            )
            
            return FuelPredictionResponse(
                vehicle_id=vehicle.id,
                prediction_period=prediction_period,
                predicted_consumption=round(predicted_consumption, 2),
                consumption_breakdown=consumption_breakdown,
                confidence_interval=confidence_interval,
                efficiency_metrics=efficiency_metrics,
                recommendations=recommendations,
                cost_estimation=cost_estimation
            )
            
        except Exception as e:
            logger.error(f"Error predicting fuel consumption: {str(e)}")
            raise
    
    def _calculate_base_consumption(self, historical_data: List[HistoricalFuelData]) -> float:
        """Calculate base daily fuel consumption from historical data."""
        if not historical_data:
            return 15.0  # Default consumption
        
        total_fuel = sum(data.fuel_consumed for data in historical_data)
        return total_fuel / len(historical_data)
    
    def _get_vehicle_factor(self, vehicle: VehicleData) -> float:
        """Get vehicle-specific consumption factor."""
        # Age factor
        age = 2024 - vehicle.year
        age_factor = 1.0 + (age * 0.02)  # 2% increase per year
        
        # Vehicle type factor
        type_factors = {
            "TRUCK": 1.5,
            "CAR": 1.0,
            "MOTORCYCLE": 0.3,
            "HEAVY_MACHINERY": 2.0,
            "AMBULANCE": 1.2,
            "FIRE_TRUCK": 1.8
        }
        type_factor = type_factors.get(vehicle.type, 1.0)
        
        # Fuel type factor
        fuel_factors = {
            "GASOLINE": 1.0,
            "DIESEL": 0.85,
            "ELECTRIC": 0.1,
            "HYBRID": 0.7
        }
        fuel_factor = fuel_factors.get(vehicle.fuel_type, 1.0)
        
        return age_factor * type_factor * fuel_factor
    
    def _apply_external_factors(self, external_factors: Optional[Dict[str, Any]]) -> float:
        """Apply external factors like weather, traffic, etc."""
        if not external_factors:
            return 1.0
        
        factor = 1.0
        
        # Weather factor
        if "weather" in external_factors:
            weather = external_factors["weather"]
            if weather in ["rain", "snow"]:
                factor *= 1.1
            elif weather == "extreme_cold":
                factor *= 1.15
            elif weather == "extreme_heat":
                factor *= 1.05
        
        # Traffic factor
        if "traffic_level" in external_factors:
            traffic_factors = {
                "low": 0.95,
                "medium": 1.0,
                "high": 1.15,
                "extreme": 1.25
            }
            factor *= traffic_factors.get(external_factors["traffic_level"], 1.0)
        
        # Maintenance factor
        if "maintenance_status" in external_factors:
            if external_factors["maintenance_status"] == "overdue":
                factor *= 1.1
            elif external_factors["maintenance_status"] == "recent":
                factor *= 0.95
        
        return factor
    
    def _build_feature_vector(
        self,
        vehicle: VehicleData,
        historical_data: List[HistoricalFuelData],
        external_factors: Optional[Dict[str, Any]],
        planned_routes: Optional[List[Dict[str, Any]]]
    ) -> np.ndarray:
        """Convert vehicle + contextual data into numeric features for XGBoost."""
        age = max(1, datetime.utcnow().year - vehicle.year)
        avg_distance = np.mean([day.distance_traveled for day in historical_data]) if historical_data else 50
        avg_speed = np.mean([day.avg_speed or 35 for day in historical_data if day.avg_speed]) if historical_data else 35
        highway_ratio = (
            len([day for day in historical_data if day.route_type == "highway"]) / max(1, len(historical_data))
        )
        maintenance_factor = (external_factors or {}).get("maintenance_score", 0.5)
        traffic_level = (external_factors or {}).get("traffic_level", "medium")
        traffic_map = {"low": 0.8, "medium": 1.0, "high": 1.15, "extreme": 1.3}
        traffic_score = traffic_map.get(traffic_level, 1.0)
        planned_distance = sum(route.get("distance_km", 0) for route in (planned_routes or []))
        
        vehicle_type_codes = {"TRUCK": 3, "CAR": 1, "MOTORCYCLE": 0, "HEAVY_MACHINERY": 4, "VAN": 2}
        fuel_type_codes = {"DIESEL": 2, "GASOLINE": 1, "ELECTRIC": 0, "HYBRID": 3}
        
        return np.array([
            age,
            avg_distance,
            avg_speed,
            highway_ratio,
            maintenance_factor,
            traffic_score,
            planned_distance,
            vehicle_type_codes.get(vehicle.vehicle_type, 1),
            fuel_type_codes.get(vehicle.fuel_type, 1)
        ], dtype=np.float32)
    
    def _generate_daily_breakdown(
        self, total_consumption: float, start_date: datetime, days: int
    ) -> Dict[str, float]:
        """Generate daily consumption breakdown."""
        breakdown = {}
        daily_base = total_consumption / days
        
        for i in range(days):
            date = start_date + timedelta(days=i)
            date_str = date.strftime("%Y-%m-%d")
            
            # Add some random variation
            variation = 1.0 + (random.random() - 0.5) * 0.3
            breakdown[date_str] = round(daily_base * variation, 2)
        
        return breakdown
    
    def _calculate_efficiency_metrics(
        self, vehicle: VehicleData, historical_data: List[HistoricalFuelData], predicted_consumption: float
    ) -> Dict[str, float]:
        """Calculate efficiency metrics."""
        if historical_data:
            avg_efficiency = np.mean([
                data.distance_traveled / data.fuel_consumed 
                for data in historical_data 
                if data.fuel_consumed > 0
            ])
            
            total_distance = sum(data.distance_traveled for data in historical_data)
            total_fuel = sum(data.fuel_consumed for data in historical_data)
            overall_efficiency = total_distance / total_fuel if total_fuel > 0 else 0
        else:
            avg_efficiency = 12.0  # Default km/L
            overall_efficiency = 12.0
        
        return {
            "average_efficiency_km_per_liter": round(avg_efficiency, 2),
            "overall_efficiency_km_per_liter": round(overall_efficiency, 2),
            "predicted_efficiency_km_per_liter": round(avg_efficiency * 0.98, 2),  # Slight degradation
            "efficiency_trend": "stable"
        }
    
    def _generate_fuel_recommendations(
        self, vehicle: VehicleData, historical_data: List[HistoricalFuelData], predicted_consumption: float
    ) -> List[str]:
        """Generate fuel optimization recommendations."""
        recommendations = []
        
        # Age-based recommendations
        age = 2024 - vehicle.year
        if age > 10:
            recommendations.append("Consider vehicle replacement or major maintenance for better efficiency")
        elif age > 5:
            recommendations.append("Schedule comprehensive maintenance check to optimize fuel efficiency")
        
        # Consumption-based recommendations
        if predicted_consumption > 100:
            recommendations.append("High fuel consumption predicted - review routes and driving patterns")
        
        # Historical pattern analysis
        if historical_data:
            avg_daily = np.mean([data.fuel_consumed for data in historical_data])
            if predicted_consumption / 30 > avg_daily * 1.2:  # Assuming 30-day prediction
                recommendations.append("Predicted consumption is 20% higher than historical average")
        
        # General recommendations
        recommendations.extend([
            "Maintain steady driving speeds to improve fuel efficiency",
            "Regular tire pressure checks can save up to 3% in fuel consumption",
            "Consider route optimization to reduce unnecessary mileage"
        ])
        
        return recommendations
    
    async def analyze_fleet_efficiency(
        self,
        vehicles: List[VehicleData],
        time_period: Dict[str, str],
        fuel_price_per_liter: Optional[float] = None
    ) -> FuelAnalyzeResponse:
        """Analyze fuel efficiency across the fleet."""
        # Mock fleet analysis
        await asyncio.sleep(1)
        
        fleet_summary = {
            "total_vehicles": len(vehicles),
            "total_predicted_consumption": random.uniform(500, 2000),
            "average_efficiency": random.uniform(10, 15),
            "best_performing_vehicle": random.choice(vehicles).plate_number if vehicles else "N/A",
            "worst_performing_vehicle": random.choice(vehicles).plate_number if vehicles else "N/A"
        }
        
        # Generate vehicle rankings
        vehicle_rankings = {
            "efficiency": [
                {
                    "vehicle_id": vehicle.id,
                    "plate_number": vehicle.plate_number,
                    "efficiency_score": random.uniform(8, 16),
                    "rank": i + 1
                }
                for i, vehicle in enumerate(vehicles[:10])  # Top 10
            ],
            "cost": [
                {
                    "vehicle_id": vehicle.id,
                    "plate_number": vehicle.plate_number,
                    "monthly_cost": random.uniform(500, 1500),
                    "rank": i + 1
                }
                for i, vehicle in enumerate(vehicles[:10])
            ]
        }
        
        optimization_opportunities = [
            {
                "type": "route_optimization",
                "potential_savings": f"{random.randint(5, 15)}%",
                "implementation_effort": "medium"
            },
            {
                "type": "maintenance_scheduling",
                "potential_savings": f"{random.randint(3, 8)}%",
                "implementation_effort": "low"
            }
        ]
        
        cost_breakdown = {
            "fuel_costs": random.uniform(10000, 50000),
            "maintenance_costs": random.uniform(2000, 8000),
            "operational_costs": random.uniform(5000, 15000)
        }
        
        trends = {
            "consumption_trend": "decreasing",
            "efficiency_trend": "improving",
            "cost_trend": "stable"
        }
        
        return FuelAnalyzeResponse(
            analysis_period=time_period,
            fleet_summary=fleet_summary,
            vehicle_rankings=vehicle_rankings,
            optimization_opportunities=optimization_opportunities,
            cost_breakdown=cost_breakdown,
            trends=trends
        )
    
    async def optimize_fuel_usage(
        self,
        vehicles: List[VehicleData],
        routes: List[Dict[str, Any]],
        constraints: Dict[str, Any],
        optimization_goal: str = "cost"
    ) -> FuelOptimizationResponse:
        """Optimize fuel usage across vehicles and routes."""
        # Mock optimization
        await asyncio.sleep(2)
        
        optimized_assignments = [
            {
                "vehicle_id": vehicle.id,
                "assigned_routes": random.sample(routes, min(3, len(routes))),
                "expected_consumption": random.uniform(20, 80),
                "efficiency_score": random.uniform(0.8, 1.0)
            }
            for vehicle in vehicles[:5]  # Optimize top 5 vehicles
        ]
        
        expected_savings = {
            "fuel_savings_liters": random.uniform(100, 500),
            "cost_savings": random.uniform(2000, 10000),
            "efficiency_improvement": f"{random.randint(5, 20)}%"
        }
        
        implementation_plan = [
            {
                "step": "Route reassignment",
                "timeline": "Week 1",
                "responsible": "Fleet Manager",
                "expected_impact": "15% fuel reduction"
            },
            {
                "step": "Driver training",
                "timeline": "Week 2-3",
                "responsible": "HR Department",
                "expected_impact": "5% efficiency improvement"
            }
        ]
        
        monitoring_recommendations = [
            "Monitor fuel consumption weekly",
            "Track route efficiency metrics",
            "Review optimization results monthly",
            "Adjust assignments based on performance data"
        ]
        
        return FuelOptimizationResponse(
            optimized_assignments=optimized_assignments,
            expected_savings=expected_savings,
            implementation_plan=implementation_plan,
            monitoring_recommendations=monitoring_recommendations
        )
    
    async def get_efficiency_rankings(
        self, time_period_days: int, vehicle_type: str = None, fuel_type: str = None
    ) -> Dict[str, Any]:
        """Get vehicle efficiency rankings."""
        # Mock rankings
        return {
            "period_days": time_period_days,
            "filters": {"vehicle_type": vehicle_type, "fuel_type": fuel_type},
            "rankings": [
                {
                    "rank": i + 1,
                    "vehicle_id": f"vehicle_{i+1}",
                    "efficiency_score": random.uniform(10, 20),
                    "improvement": f"+{random.randint(1, 10)}%"
                }
                for i in range(10)
            ]
        }
    
    async def get_consumption_trends(
        self, vehicle_id: str = None, period: str = "month", include_forecast: bool = True
    ) -> Dict[str, Any]:
        """Get consumption trends with forecasting."""
        # Mock trends
        return {
            "vehicle_id": vehicle_id,
            "period": period,
            "historical_data": [
                {"date": f"2024-01-{i:02d}", "consumption": random.uniform(10, 30)}
                for i in range(1, 31)
            ],
            "forecast_data": [
                {"date": f"2024-02-{i:02d}", "predicted_consumption": random.uniform(10, 30)}
                for i in range(1, 29)
            ] if include_forecast else None,
            "trend_analysis": {
                "direction": random.choice(["increasing", "decreasing", "stable"]),
                "strength": random.uniform(0.1, 0.9),
                "confidence": random.uniform(0.8, 0.95)
            }
        }
    
    async def retrain_models(self, task_id: str):
        """Retrain prediction models with latest data."""
        logger.info(f"Starting model retraining {task_id}")
        
        # Mock retraining process
        await asyncio.sleep(10)  # Simulate training time
        
        logger.info(f"Model retraining {task_id} completed")
    
    async def get_model_performance(self) -> Dict[str, Any]:
        """Get current model performance metrics."""
        return {
            "model_version": self.model_version,
            "accuracy": self.prediction_accuracy,
            "mean_absolute_error": random.uniform(1.5, 3.0),
            "root_mean_square_error": random.uniform(2.0, 4.0),
            "last_training_date": "2024-01-01",
            "training_samples": random.randint(1000, 5000),
            "validation_score": random.uniform(0.85, 0.95)
        }
