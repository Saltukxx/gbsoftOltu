from collections import defaultdict
from datetime import datetime
from typing import Dict, List, Tuple

from ortools.sat.python import cp_model

from schemas.shifts import EmployeeInput, ShiftAssignment, ShiftConstraint, ShiftSlot
from utils.logger import logger


class TimefoldHybridSolver:
    """
    Lightweight CP-SAT based solver that emulates a Timefold-style constraint
    solver. We rely exclusively on open-source OR-Tools so we can run on-prem
    without vendor lock-in while still honoring hard constraints.
    """

    def __init__(self):
        self.shift_hours = 8
        self.max_solve_time = 30  # seconds
        self.confidence_floor = 0.55

    def solve(
        self,
        employees: List[EmployeeInput],
        time_slots: List[Dict[str, str]],
        constraints: ShiftConstraint,
    ) -> Tuple[List[ShiftAssignment], Dict[str, int]]:
        model = cp_model.CpModel()
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = self.max_solve_time
        solver.parameters.num_search_workers = 8

        assignments = {}
        coverage_tracker = defaultdict(list)

        # Create binary decision variables
        for emp_idx, employee in enumerate(employees):
            for slot_idx, slot in enumerate(time_slots):
                if not self._is_available(employee, slot, constraints):
                    continue
                var = model.NewBoolVar(f"x_e{emp_idx}_s{slot_idx}")
                assignments[(emp_idx, slot_idx)] = var
                coverage_tracker[slot_idx].append(var)

        # Coverage constraint: each slot must have exactly one assignee if feasible
        uncovered_slots = []
        for slot_idx, variables in coverage_tracker.items():
            if variables:
                model.AddExactlyOne(variables)
            else:
                uncovered_slots.append(slot_idx)

        # Max hours per employee (respect both employee + global constraint)
        for emp_idx, employee in enumerate(employees):
            employee_vars = [
                var
                for (e_idx, _), var in assignments.items()
                if e_idx == emp_idx
            ]
            if employee_vars:
                max_hours = min(employee.max_hours_per_week, constraints.max_hours_per_week)
                model.Add(sum(employee_vars) * self.shift_hours <= max_hours)

        # At most one shift per day per employee (min rest hours)
        days = sorted({slot["date"] for slot in time_slots})
        day_to_slots = defaultdict(list)
        for idx, slot in enumerate(time_slots):
            day_to_slots[slot["date"]].append(idx)

        for emp_idx in range(len(employees)):
            for day, indices in day_to_slots.items():
                vars_for_day = [
                    assignments[(emp_idx, slot_idx)]
                    for slot_idx in indices
                    if (emp_idx, slot_idx) in assignments
                ]
                if vars_for_day:
                    model.Add(sum(vars_for_day) <= 1)

        # Max consecutive days constraint via sliding window
        max_consecutive = constraints.max_consecutive_days or 7
        for emp_idx in range(len(employees)):
            indicator_array = []
            for slot_idx, slot in enumerate(time_slots):
                if slot_idx == 0 or slot["date"] != time_slots[slot_idx - 1]["date"]:
                    # new day indicator
                    indicator = model.NewBoolVar(f"day_active_e{emp_idx}_d{slot_idx}")
                    relevant_vars = [
                        assignments[(emp_idx, s_idx)]
                        for s_idx in day_to_slots[slot["date"]]
                        if (emp_idx, s_idx) in assignments
                    ]
                    if relevant_vars:
                        model.AddMaxEquality(indicator, relevant_vars)
                    else:
                        model.Add(indicator == 0)
                    indicator_array.append((slot["date"], indicator))

            for i in range(len(indicator_array) - max_consecutive):
                window = [indicator for _, indicator in indicator_array[i : i + max_consecutive + 1]]
                if window:
                    model.Add(sum(window) <= max_consecutive)

        # Objective: maximize aggregate performance while rewarding fairness
        objective_terms = []
        average_target = len(time_slots) / max(1, len(employees))
        for (emp_idx, slot_idx), var in assignments.items():
            employee = employees[emp_idx]
            slot = time_slots[slot_idx]
            performance_weight = int(employee.performance_score * 100)
            fairness_weight = int(max(average_target - employee.performance_score * 2, 0) * 10)
            critical_skill_bonus = 40 if self._slot_requires_skill(slot, constraints, employee) else 0
            objective_terms.append(
                (performance_weight + fairness_weight + critical_skill_bonus) * var
            )

        if objective_terms:
            model.Maximize(sum(objective_terms))

        status = solver.Solve(model)
        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            raise RuntimeError("TimefoldHybridSolver could not find a feasible solution")

        schedule = []
        for (emp_idx, slot_idx), var in assignments.items():
            if solver.BooleanValue(var):
                slot = time_slots[slot_idx]
                employee = employees[emp_idx]
                confidence = max(
                    self.confidence_floor,
                    min(0.95, employee.performance_score / 5 + 0.2),
                )
                schedule.append(
                    ShiftAssignment(
                        employee_id=employee.id,
                        employee_name=employee.name,
                        day=slot["date"],
                        slot=slot["slot"],
                        confidence=round(confidence, 2),
                        required_skills=slot.get("required_skills"),
                    )
                )

        violations = {"uncovered_slots": len(uncovered_slots)}
        return schedule, violations

    def _is_available(
        self,
        employee: EmployeeInput,
        slot: Dict[str, str],
        constraints: ShiftConstraint,
    ) -> bool:
        day_name = datetime.fromisoformat(slot["date"]).strftime("%A").lower()
        availability = {
            k.lower(): [s.lower() for s in v] for k, v in employee.availability.items()
        }
        available_slots = availability.get(day_name, [])
        if slot["slot"].value.lower() not in available_slots:
            return False

        if constraints.required_skills:
            required = constraints.required_skills.get(slot["slot"].value.lower(), [])
            if required and not set(required).intersection(set(employee.skills)):
                return False
        return True

    def _slot_requires_skill(
        self,
        slot: Dict[str, str],
        constraints: ShiftConstraint,
        employee: EmployeeInput,
    ) -> bool:
        if not constraints.required_skills:
            return False
        required = constraints.required_skills.get(slot["slot"].value.lower(), [])
        return bool(set(required).intersection(set(employee.skills)))
