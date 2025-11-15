import json
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from utils.logger import logger

try:
    from xgboost import XGBRegressor
except Exception:  # pragma: no cover - xgboost optional in some envs
    XGBRegressor = None

try:
    from prophet import Prophet
    from prophet.serialize import model_to_json, model_from_json
except Exception:  # pragma: no cover
    Prophet = None
    model_to_json = model_from_json = None


class ModelRegistry:
    """
    Lazy-loading registry for ML artifacts used by the AI service.

    Models are trained on lightweight synthetic datasets so we can ship
    functional artifacts without depending on external APIs. Artifacts
    are cached under `models/artifacts` and re-used across restarts.
    """

    def __init__(self, artifacts_dir: Optional[Path] = None):
        self.artifacts_dir = artifacts_dir or Path(__file__).resolve().parent.parent / "models" / "artifacts"
        self.artifacts_dir.mkdir(parents=True, exist_ok=True)

        self._fuel_model_path = self.artifacts_dir / "fuel_xgb.json"
        self._emission_model_path = self.artifacts_dir / "emission_prophet.json"
        self._fuel_model: Optional["XGBRegressor"] = None
        self._emission_model: Optional["Prophet"] = None

    def get_fuel_model(self) -> Optional["XGBRegressor"]:
        """Return a trained XGBoost regressor (train if missing)."""
        if XGBRegressor is None:
            logger.warning("XGBoost not available; falling back to heuristic predictor")
            return None

        if self._fuel_model is None:
            model = XGBRegressor(
                max_depth=4,
                n_estimators=80,
                eta=0.1,
                subsample=0.9,
                colsample_bytree=0.9,
                min_child_weight=2,
                reg_lambda=1.5
            )

            if self._fuel_model_path.exists():
                logger.info("Loading cached fuel model from %s", self._fuel_model_path)
                model.load_model(str(self._fuel_model_path))
            else:
                logger.info("Training synthetic fuel model artifact")
                X_train, y_train = self._generate_synthetic_fuel_dataset()
                model.fit(X_train, y_train)
                model.save_model(str(self._fuel_model_path))
                logger.info("Fuel model artifact saved → %s", self._fuel_model_path)

            self._fuel_model = model

        return self._fuel_model

    def get_emission_forecaster(self) -> Optional["Prophet"]:
        """Return a Prophet forecaster for emission trends."""
        if Prophet is None:
            logger.warning("Prophet is not available; emission forecasts will be heuristic")
            return None

        if self._emission_model is None:
            if self._emission_model_path.exists():
                logger.info("Loading cached emission forecaster from %s", self._emission_model_path)
                with open(self._emission_model_path, "r", encoding="utf-8") as fh:
                    self._emission_model = model_from_json(json.load(fh))
            else:
                logger.info("Training synthetic emission Prophet model")
                df = self._generate_synthetic_emission_frame()
                model = Prophet(
                    weekly_seasonality=True,
                    yearly_seasonality=True,
                    changepoint_prior_scale=0.15,
                    seasonality_mode="additive"
                )
                model.fit(df)
                with open(self._emission_model_path, "w", encoding="utf-8") as fh:
                    json.dump(model_to_json(model), fh)
                logger.info("Emission model artifact saved → %s", self._emission_model_path)
                self._emission_model = model

        return self._emission_model

    def forecast_emissions(self, days: int) -> Optional[pd.DataFrame]:
        """Convenience helper returning Prophet predictions for N days."""
        model = self.get_emission_forecaster()
        if model is None:
            return None

        future = model.make_future_dataframe(periods=days, freq="D", include_history=False)
        forecast = model.predict(future)
        return forecast[["ds", "yhat", "yhat_lower", "yhat_upper"]]

    def _generate_synthetic_fuel_dataset(self):
        """Create a reproducible synthetic dataset for training XGBoost."""
        rng = np.random.default_rng(42)

        vehicle_types = ["TRUCK", "CAR", "VAN", "HEAVY_MACHINERY"]
        fuel_types = ["DIESEL", "GASOLINE", "ELECTRIC", "HYBRID"]

        records = []
        targets = []

        for v_type_idx, v_type in enumerate(vehicle_types):
            for fuel_idx, fuel in enumerate(fuel_types):
                for age in range(1, 11):
                    for avg_distance in (35, 60, 90, 120):
                        for avg_speed in (25, 40, 55):
                            maintenance = rng.uniform(0, 1)
                            traffic = rng.uniform(0.5, 1.5)

                            route_weight = 1.25 if avg_speed < 30 else 0.95
                            fuel_factor = {
                                "DIESEL": 0.85,
                                "GASOLINE": 1.0,
                                "ELECTRIC": 0.15,
                                "HYBRID": 0.6
                            }[fuel]
                            base = avg_distance * 0.12
                            age_penalty = age * 0.35
                            vehicle_penalty = (v_type_idx + 1) * 1.2
                            random_noise = rng.normal(0, 2.5)

                            feature_vector = [
                                age,
                                avg_distance,
                                avg_speed,
                                maintenance,
                                traffic,
                                v_type_idx,
                                fuel_idx,
                                route_weight,
                            ]
                            consumption = (
                                base * fuel_factor * traffic * route_weight
                                + age_penalty
                                + vehicle_penalty
                                - maintenance * 3
                                + random_noise
                            )

                            records.append(feature_vector)
                            targets.append(max(consumption, 2.0))

        return np.array(records, dtype=np.float32), np.array(targets, dtype=np.float32)

    def _generate_synthetic_emission_frame(self):
        """Generate multi-year weekly emission records for Prophet."""
        rng = np.random.default_rng(7)
        weeks = pd.date_range(start="2019-01-06", end="2024-12-29", freq="W")

        baseline = 5200
        downward_trend = np.linspace(0, 800, len(weeks))
        seasonal = 250 * np.sin(2 * np.pi * weeks.weekofyear / 52)
        noise = rng.normal(0, 120, len(weeks))

        y = baseline - downward_trend + seasonal + noise
        df = pd.DataFrame({"ds": weeks, "y": y})
        return df


def get_model_registry() -> ModelRegistry:
    """Singleton accessor to avoid re-training models per request."""
    if not hasattr(get_model_registry, "_instance"):
        get_model_registry._instance = ModelRegistry()
    return get_model_registry._instance  # type: ignore[attr-defined]
