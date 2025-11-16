import { ShiftSlot, ShiftStatus } from '@prisma/client';
import prisma from '@/db';
import { logger } from '@/services/logger';

export interface ShiftValidationInput {
  employeeId: string;
  day: string; // ISO date string YYYY-MM-DD
  slot: ShiftSlot;
  status?: ShiftStatus;
  excludeShiftId?: string; // For updates, exclude the current shift from conflict checks
}

export interface ValidationResult {
  isValid: boolean;
  violations: Violation[];
  warnings: Warning[];
}

export interface Violation {
  type: 'CONFLICT' | 'REST_HOURS' | 'MAX_HOURS' | 'AVAILABILITY' | 'DUPLICATE';
  message: string;
  severity: 'ERROR' | 'WARNING';
  details?: any;
}

export interface Warning {
  type: string;
  message: string;
  details?: any;
}

// Shift time definitions (in hours from midnight)
const SHIFT_TIMES: Record<ShiftSlot, { start: number; end: number }> = {
  MORNING: { start: 8, end: 16 },      // 08:00-16:00
  AFTERNOON: { start: 16, end: 24 },   // 16:00-00:00 (midnight)
  NIGHT: { start: 0, end: 8 },         // 00:00-08:00
};

// Default constraints (can be overridden from ShiftConstraint table)
const DEFAULT_CONSTRAINTS = {
  minRestHours: 12,
  maxHoursPerWeek: 40,
  maxConsecutiveDays: 6,
};

/**
 * Validates a shift against system constraints without saving to database
 */
export async function validateShift(
  input: ShiftValidationInput,
  constraints?: {
    minRestHours?: number;
    maxHoursPerWeek?: number;
    maxConsecutiveDays?: number;
  }
): Promise<ValidationResult> {
  const violations: Violation[] = [];
  const warnings: Warning[] = [];

  try {
    // Get constraints from database or use defaults
    const systemConstraints = await getSystemConstraints();
    const minRestHours = constraints?.minRestHours ?? systemConstraints.minRestHours ?? DEFAULT_CONSTRAINTS.minRestHours;
    const maxHoursPerWeek = constraints?.maxHoursPerWeek ?? systemConstraints.maxHoursPerWeek ?? DEFAULT_CONSTRAINTS.maxHoursPerWeek;
    const maxConsecutiveDays = constraints?.maxConsecutiveDays ?? systemConstraints.maxConsecutiveDays ?? DEFAULT_CONSTRAINTS.maxConsecutiveDays;

    const shiftDate = new Date(input.day);
    if (isNaN(shiftDate.getTime())) {
      violations.push({
        type: 'CONFLICT',
        message: 'Invalid date format',
        severity: 'ERROR',
      });
      return { isValid: false, violations, warnings };
    }

    // Normalize date to start of day
    shiftDate.setHours(0, 0, 0, 0);

    // 1. Check for duplicate shift (same employee, day, slot)
    const duplicateCheck = await checkDuplicateShift(
      input.employeeId,
      shiftDate,
      input.slot,
      input.excludeShiftId
    );
    if (duplicateCheck) {
      violations.push({
        type: 'DUPLICATE',
        message: 'Employee already has a shift assigned for this time slot',
        severity: 'ERROR',
        details: { existingShiftId: duplicateCheck },
      });
    }

    // 2. Check for overlapping shifts (conflicts)
    const conflictCheck = await checkShiftConflicts(
      input.employeeId,
      shiftDate,
      input.slot,
      input.excludeShiftId
    );
    if (conflictCheck.hasConflict) {
      violations.push({
        type: 'CONFLICT',
        message: conflictCheck.message,
        severity: 'ERROR',
        details: conflictCheck.details,
      });
    }

    // 3. Check minimum rest hours between consecutive shifts
    const restHoursCheck = await checkRestHours(
      input.employeeId,
      shiftDate,
      input.slot,
      minRestHours,
      input.excludeShiftId
    );
    if (!restHoursCheck.isValid) {
      violations.push({
        type: 'REST_HOURS',
        message: restHoursCheck.message,
        severity: 'ERROR',
        details: restHoursCheck.details,
      });
    }

    // 4. Check weekly hours limit
    const weekCheck = await checkWeeklyHours(
      input.employeeId,
      shiftDate,
      maxHoursPerWeek,
      input.excludeShiftId
    );
    if (!weekCheck.isValid) {
      violations.push({
        type: 'MAX_HOURS',
        message: weekCheck.message,
        severity: weekCheck.wouldExceed ? 'ERROR' : 'WARNING',
        details: weekCheck.details,
      });
    }

    // 5. Check employee availability (if available in employee record)
    const availabilityCheck = await checkEmployeeAvailability(
      input.employeeId,
      shiftDate,
      input.slot
    );
    if (!availabilityCheck.isAvailable) {
      warnings.push({
        type: 'AVAILABILITY',
        message: availabilityCheck.message,
        details: availabilityCheck.details,
      });
    }

    // 6. Check consecutive days limit
    const consecutiveCheck = await checkConsecutiveDays(
      input.employeeId,
      shiftDate,
      maxConsecutiveDays,
      input.excludeShiftId
    );
    if (!consecutiveCheck.isValid) {
      warnings.push({
        type: 'CONSECUTIVE_DAYS',
        message: consecutiveCheck.message,
        details: consecutiveCheck.details,
      });
    }

    return {
      isValid: violations.filter(v => v.severity === 'ERROR').length === 0,
      violations,
      warnings,
    };
  } catch (error) {
    logger.error('Error validating shift:', error);
    violations.push({
      type: 'CONFLICT',
      message: 'An error occurred during validation',
      severity: 'ERROR',
      details: { error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return { isValid: false, violations, warnings };
  }
}

/**
 * Check for duplicate shift (same employee, day, slot)
 */
async function checkDuplicateShift(
  employeeId: string,
  day: Date,
  slot: ShiftSlot,
  excludeShiftId?: string
): Promise<string | null> {
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(day);
  dayEnd.setHours(23, 59, 59, 999);

  const existing = await prisma.shift.findFirst({
    where: {
      employeeId,
      day: {
        gte: dayStart,
        lte: dayEnd,
      },
      slot,
      deletedAt: null,
      ...(excludeShiftId ? { id: { not: excludeShiftId } } : {}),
    },
    select: { id: true },
  });

  return existing?.id ?? null;
}

/**
 * Check for overlapping shifts (conflicts)
 */
async function checkShiftConflicts(
  employeeId: string,
  day: Date,
  slot: ShiftSlot,
  excludeShiftId?: string
): Promise<{ hasConflict: boolean; message: string; details?: any }> {
  // Get all shifts for this employee on the same day
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(day);
  dayEnd.setHours(23, 59, 59, 999);

  const sameDayShifts = await prisma.shift.findMany({
    where: {
      employeeId,
      day: {
        gte: dayStart,
        lte: dayEnd,
      },
      deletedAt: null,
      ...(excludeShiftId ? { id: { not: excludeShiftId } } : {}),
    },
  });

  // Check if there's already a shift in a different slot on the same day
  // This is allowed, but we can warn if there are multiple shifts
  if (sameDayShifts.length > 0) {
    const conflictingSlot = sameDayShifts.find(s => s.slot !== slot);
    if (conflictingSlot) {
      // Multiple shifts on same day is allowed, but we can note it
      return {
        hasConflict: false,
        message: `Employee has another shift (${conflictingSlot.slot}) on the same day`,
        details: { otherShift: conflictingSlot.id, otherSlot: conflictingSlot.slot },
      };
    }
  }

  return { hasConflict: false, message: '' };
}

/**
 * Check minimum rest hours between consecutive shifts
 */
async function checkRestHours(
  employeeId: string,
  day: Date,
  slot: ShiftSlot,
  minRestHours: number,
  excludeShiftId?: string
): Promise<{ isValid: boolean; message: string; details?: any }> {
  const shiftTime = SHIFT_TIMES[slot];
  const shiftStartHour = shiftTime.start;
  const shiftEndHour = shiftTime.end === 0 ? 24 : shiftTime.end;

  // Check previous day's shifts
  const previousDay = new Date(day);
  previousDay.setDate(previousDay.getDate() - 1);
  previousDay.setHours(0, 0, 0, 0);

  const previousDayShifts = await prisma.shift.findMany({
    where: {
      employeeId,
      day: {
        gte: previousDay,
        lt: new Date(previousDay.getTime() + 24 * 60 * 60 * 1000),
      },
      deletedAt: null,
      ...(excludeShiftId ? { id: { not: excludeShiftId } } : {}),
    },
  });

  for (const prevShift of previousDayShifts) {
    const prevShiftTime = SHIFT_TIMES[prevShift.slot];
    const prevEndHour = prevShiftTime.end === 0 ? 24 : prevShiftTime.end;
    
    // Calculate rest hours
    const restHours = shiftStartHour + (24 - prevEndHour);
    
    if (restHours < minRestHours) {
      return {
        isValid: false,
        message: `Insufficient rest hours: ${restHours}h between shifts (minimum: ${minRestHours}h)`,
        details: {
          previousShift: prevShift.id,
          previousSlot: prevShift.slot,
          restHours,
          minRestHours,
        },
      };
    }
  }

  // Check same day shifts (for NIGHT shift after AFTERNOON)
  if (slot === ShiftSlot.NIGHT) {
    const dayStart = new Date(day);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(day);
    dayEnd.setHours(23, 59, 59, 999);

    const sameDayAfternoon = await prisma.shift.findFirst({
      where: {
        employeeId,
        day: {
          gte: dayStart,
          lte: dayEnd,
        },
        slot: ShiftSlot.AFTERNOON,
        deletedAt: null,
        ...(excludeShiftId ? { id: { not: excludeShiftId } } : {}),
      },
    });

    if (sameDayAfternoon) {
      const restHours = 0; // NIGHT starts immediately after AFTERNOON ends
      if (restHours < minRestHours) {
        return {
          isValid: false,
          message: `Insufficient rest hours: ${restHours}h between shifts (minimum: ${minRestHours}h)`,
          details: {
            previousShift: sameDayAfternoon.id,
            previousSlot: sameDayAfternoon.slot,
            restHours,
            minRestHours,
          },
        };
      }
    }
  }

  return { isValid: true, message: '' };
}

/**
 * Check weekly hours limit
 */
async function checkWeeklyHours(
  employeeId: string,
  day: Date,
  maxHoursPerWeek: number,
  excludeShiftId?: string
): Promise<{ isValid: boolean; wouldExceed: boolean; message: string; details?: any }> {
  // Calculate week start (Monday)
  const weekStart = new Date(day);
  const dayOfWeek = weekStart.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  weekStart.setDate(weekStart.getDate() - daysToMonday);
  weekStart.setHours(0, 0, 0, 0);

  // Calculate week end (Sunday)
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  // Get all shifts in this week
  const weekShifts = await prisma.shift.findMany({
    where: {
      employeeId,
      day: {
        gte: weekStart,
        lte: weekEnd,
      },
      deletedAt: null,
      ...(excludeShiftId ? { id: { not: excludeShiftId } } : {}),
    },
  });

  // Calculate total hours (assuming 8 hours per shift)
  const hoursPerShift = 8;
  const currentHours = weekShifts.length * hoursPerShift;
  const newTotalHours = currentHours + hoursPerShift;

  if (newTotalHours > maxHoursPerWeek) {
    return {
      isValid: false,
      wouldExceed: true,
      message: `Weekly hours limit would be exceeded: ${newTotalHours}h > ${maxHoursPerWeek}h`,
      details: {
        currentHours,
        newTotalHours,
        maxHoursPerWeek,
        shiftsInWeek: weekShifts.length,
      },
    };
  }

  // Warn if close to limit
  if (newTotalHours > maxHoursPerWeek * 0.9) {
    return {
      isValid: true,
      wouldExceed: false,
      message: `Approaching weekly hours limit: ${newTotalHours}h / ${maxHoursPerWeek}h`,
      details: {
        currentHours,
        newTotalHours,
        maxHoursPerWeek,
      },
    };
  }

  return { isValid: true, wouldExceed: false, message: '' };
}

/**
 * Check employee availability
 */
async function checkEmployeeAvailability(
  employeeId: string,
  day: Date,
  slot: ShiftSlot
): Promise<{ isAvailable: boolean; message: string; details?: any }> {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { availability: true, isActive: true },
  });

  if (!employee) {
    return {
      isAvailable: false,
      message: 'Employee not found',
    };
  }

  if (!employee.isActive) {
    return {
      isAvailable: false,
      message: 'Employee is not active',
    };
  }

  // Check availability if it's stored in the employee record
  if (employee.availability) {
    const availability = employee.availability as any;
    const dayOfWeek = day.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][dayOfWeek];

    if (availability[dayName] && Array.isArray(availability[dayName])) {
      const availableSlots = availability[dayName];
      const slotLower = slot.toLowerCase();
      
      if (!availableSlots.includes(slotLower)) {
        return {
          isAvailable: false,
          message: `Employee is not available for ${slot} shift on ${dayName}`,
          details: {
            day: dayName,
            slot,
            availableSlots,
          },
        };
      }
    }
  }

  return { isAvailable: true, message: '' };
}

/**
 * Check consecutive days limit
 */
async function checkConsecutiveDays(
  employeeId: string,
  day: Date,
  maxConsecutiveDays: number,
  excludeShiftId?: string
): Promise<{ isValid: boolean; message: string; details?: any }> {
  // Check how many consecutive days the employee has shifts
  let consecutiveDays = 1;
  let checkDate = new Date(day);
  checkDate.setDate(checkDate.getDate() - 1);

  // Check backwards
  while (consecutiveDays < maxConsecutiveDays + 1) {
    const dayStart = new Date(checkDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(checkDate);
    dayEnd.setHours(23, 59, 59, 999);

    const hasShift = await prisma.shift.findFirst({
      where: {
        employeeId,
        day: {
          gte: dayStart,
          lte: dayEnd,
        },
        deletedAt: null,
        ...(excludeShiftId ? { id: { not: excludeShiftId } } : {}),
      },
    });

    if (!hasShift) break;
    consecutiveDays++;
    checkDate.setDate(checkDate.getDate() - 1);
  }

  if (consecutiveDays > maxConsecutiveDays) {
    return {
      isValid: false,
      message: `Employee would have ${consecutiveDays} consecutive days of shifts (maximum: ${maxConsecutiveDays})`,
      details: {
        consecutiveDays,
        maxConsecutiveDays,
      },
    };
  }

  return { isValid: true, message: '' };
}

/**
 * Get system constraints from database
 */
async function getSystemConstraints(): Promise<{
  minRestHours?: number;
  maxHoursPerWeek?: number;
  maxConsecutiveDays?: number;
}> {
  try {
    const constraints = await prisma.shiftConstraint.findMany({
      where: {
        key: {
          in: ['min_rest_hours', 'max_hours_per_week', 'max_consecutive_days'],
        },
      },
    });

    const result: any = {};
    for (const constraint of constraints) {
      if (constraint.key === 'min_rest_hours') {
        result.minRestHours = typeof constraint.value === 'number' ? constraint.value : Number(constraint.value);
      } else if (constraint.key === 'max_hours_per_week') {
        result.maxHoursPerWeek = typeof constraint.value === 'number' ? constraint.value : Number(constraint.value);
      } else if (constraint.key === 'max_consecutive_days') {
        result.maxConsecutiveDays = typeof constraint.value === 'number' ? constraint.value : Number(constraint.value);
      }
    }

    return result;
  } catch (error) {
    logger.error('Error fetching system constraints:', error);
    return {};
  }
}

