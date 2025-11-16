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
        self.base_timeout = 60  # Base timeout increased from 30 to 60 seconds
        self.max_timeout = 180  # Maximum timeout for very large problems
        self.confidence_floor = 0.55

    def solve(
        self,
        employees: List[EmployeeInput],
        time_slots: List[Dict[str, str]],
        constraints: ShiftConstraint,
    ) -> Tuple[List[ShiftAssignment], Dict[str, int]]:
        # Adaptive timeout based on problem complexity
        timeout = self._calculate_adaptive_timeout(len(employees), len(time_slots), constraints)
        logger.info(f"Using adaptive timeout: {timeout}s for {len(employees)} employees, {len(time_slots)} slots")
        
        model = cp_model.CpModel()
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = timeout
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

        # Minimum rest hours constraint between consecutive shifts
        # Define shift end times (in hours from midnight)
        shift_times = {
            ShiftSlot.MORNING: {"start": 8, "end": 16},      # 08:00-16:00
            ShiftSlot.AFTERNOON: {"start": 16, "end": 24},   # 16:00-00:00 (midnight)
            ShiftSlot.NIGHT: {"start": 0, "end": 8},         # 00:00-08:00
        }

        days = sorted({slot["date"] for slot in time_slots})
        day_to_slots = defaultdict(list)
        for idx, slot in enumerate(time_slots):
            day_to_slots[slot["date"]].append(idx)

        # For each employee, enforce minimum rest between consecutive day shifts
        min_rest_hours = constraints.min_rest_hours if hasattr(constraints, 'min_rest_hours') else 12

        for emp_idx in range(len(employees)):
            for day_idx in range(len(days) - 1):
                current_day = days[day_idx]
                next_day = days[day_idx + 1]

                current_day_slots = day_to_slots[current_day]
                next_day_slots = day_to_slots[next_day]

                # Check all combinations of current day shift -> next day shift
                for curr_slot_idx in current_day_slots:
                    if (emp_idx, curr_slot_idx) not in assignments:
                        continue

                    curr_slot = time_slots[curr_slot_idx]
                    curr_shift_end = shift_times[curr_slot["slot"]]["end"]

                    for next_slot_idx in next_day_slots:
                        if (emp_idx, next_slot_idx) not in assignments:
                            continue

                        next_slot = time_slots[next_slot_idx]
                        next_shift_start = shift_times[next_slot["slot"]]["start"]

                        # Calculate rest hours between shifts
                        # If current shift ends at 24 (midnight) and next starts at 8, rest = 8 hours
                        # If current shift ends at 16 and next starts at 8 next day, rest = 16 hours
                        if curr_shift_end == 24:
                            rest_hours = next_shift_start  # Midnight to next start
                        else:
                            rest_hours = (24 - curr_shift_end) + next_shift_start

                        # If rest is insufficient, prevent both shifts from being assigned
                        if rest_hours < min_rest_hours:
                            # Create constraint: both cannot be assigned simultaneously
                            model.Add(
                                assignments[(emp_idx, curr_slot_idx)] +
                                assignments[(emp_idx, next_slot_idx)] <= 1
                            )

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

    def _calculate_adaptive_timeout(
        self,
        num_employees: int,
        num_slots: int,
        constraints: ShiftConstraint,
    ) -> int:
        """
        Calculate adaptive timeout based on problem size and complexity.
        
        Formula:
        - Base timeout: 60 seconds
        - Employee factor: +2s per employee above 20
        - Slot factor: +0.5s per slot above 30
        - Constraint complexity: +10s if skills required, +5s if rest hours < 12
        - Cap at max_timeout (180s)
        """
        timeout = self.base_timeout
        
        # Employee complexity factor
        if num_employees > 20:
            timeout += (num_employees - 20) * 2
        
        # Slot complexity factor
        if num_slots > 30:
            timeout += (num_slots - 30) * 0.5
        
        # Constraint complexity factors
        if constraints.required_skills:
            timeout += 10  # Skill matching adds complexity
        
        min_rest = getattr(constraints, 'min_rest_hours', 12)
        if min_rest < 12:
            timeout += 5  # Tighter rest constraints add complexity
        
        # Cap at maximum
        return min(int(timeout), self.max_timeout)
    
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
