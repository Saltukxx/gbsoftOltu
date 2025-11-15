from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from enum import Enum

class ShiftSlot(str, Enum):
    MORNING = "MORNING"
    AFTERNOON = "AFTERNOON"
    NIGHT = "NIGHT"

class EmployeeInput(BaseModel):
    id: str
    name: str
    skills: List[str]
    performance_score: float = Field(ge=0, le=5)
    max_hours_per_week: int = Field(ge=0, le=168)
    availability: Dict[str, List[str]] = Field(
        description="Available days and time slots, e.g., {'monday': ['morning', 'afternoon']}"
    )

class ShiftConstraint(BaseModel):
    max_hours_per_week: int = Field(default=40, ge=0, le=168)
    min_rest_hours: int = Field(default=12, ge=0, le=24)
    max_consecutive_days: int = Field(default=6, ge=0, le=7)
    required_skills: Optional[Dict[str, List[str]]] = Field(
        default=None,
        description="Required skills per shift slot, e.g., {'morning': ['driving', 'cleaning']}"
    )

class ShiftGenerateRequest(BaseModel):
    employees: List[EmployeeInput]
    constraints: ShiftConstraint
    period: Dict[str, str] = Field(
        description="Period with start_date and end_date in ISO format"
    )
    optimize_for: str = Field(
        default="efficiency",
        description="Optimization target: 'efficiency', 'fairness', or 'cost'"
    )

class ShiftAssignment(BaseModel):
    employee_id: str
    employee_name: str
    day: str
    slot: ShiftSlot
    confidence: float = Field(ge=0, le=1)
    required_skills: Optional[List[str]] = None

class OptimizationMetrics(BaseModel):
    efficiency_score: float = Field(ge=0, le=1)
    fairness_score: float = Field(ge=0, le=1)
    constraint_violations: int = Field(ge=0)
    coverage_percentage: float = Field(ge=0, le=100)
    total_hours_assigned: int
    optimization_time_seconds: float

class ShiftGenerateResponse(BaseModel):
    schedule: List[ShiftAssignment]
    metrics: OptimizationMetrics
    violations: List[str] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)
    alternative_solutions: Optional[List[Dict[str, Any]]] = None

class ShiftAnalyzeRequest(BaseModel):
    current_schedule: List[Dict[str, Any]]
    employees: List[EmployeeInput]
    constraints: ShiftConstraint

class ShiftAnalyzeResponse(BaseModel):
    analysis: Dict[str, Any]
    recommendations: List[str]
    efficiency_score: float
    potential_improvements: Dict[str, Any]