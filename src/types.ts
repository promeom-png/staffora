export type ShiftType = 'M' | 'T' | 'P' | 'OFF' | 'VAC' | 'BAJA';
export type Position = 'cocina' | 'sala' | 'refuerzo';

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  weeklyHours: number; // 40, 38, 30, 20
  restDaysPerWeek: number; // 1 or 2
  vacationDays: number;
  vacationDates: string[]; // ISO dates
  medicalLeaveDates: string[]; // ISO dates
  position: Position;
  isRefuerzo: boolean;
  monthlyCost: number;
}

export interface RestaurantConfig {
  hasSplitShifts: boolean;
  standardWeeklyHours: number[];
  restDaysPerWeek: number;
  contiguousRestDays: boolean;
  closingDay: string | null; // 'Monday', 'Tuesday', etc. or null
  openingHours: {
    open: string;
    close: string;
  };
  shiftTimes: {
    morning: { start: string; end: string };
    afternoon: { start: string; end: string };
    split: { 
      part1Start: string; part1End: string;
      part2Start: string; part2End: string;
    };
  };
  minStaffPerShift: {
    morning: number;
    afternoon: number;
  };
  salesTarget: number;
  targetPersonnelCost: number;
  vatRate: number;
}

export interface Shift {
  employeeId: string;
  date: string;
  type: ShiftType;
}

export interface DayQuadrant {
  date: string;
  shifts: Shift[];
}
