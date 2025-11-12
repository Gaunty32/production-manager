import type { StaffShift, MachineScheduleBlock, JobSchedule, StaffMachineAllocation, StaffHoliday, BankHoliday } from "./schema";
import { calculateProductionMetrics } from "./machines";

/**
 * Represents a time slot in minutes from midnight
 */
export interface TimeSlot {
  startTime: number;
  endTime: number;
}

/**
 * Represents an available time slot for scheduling
 */
export interface AvailableSlot extends TimeSlot {
  date: Date;
  machineId: number;
  staffId: string;
}

/**
 * Convert time slots to minutes from midnight
 */
export function timeToMinutes(hours: number, minutes: number): number {
  return hours * 60 + minutes;
}

/**
 * Convert minutes from midnight to time string
 */
export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

/**
 * Check if two time slots overlap
 */
export function timeSlotsOverlap(slot1: TimeSlot, slot2: TimeSlot): boolean {
  return slot1.startTime < slot2.endTime && slot2.startTime < slot1.endTime;
}

/**
 * Calculate the intersection of two time slots
 * Returns null if they don't overlap
 */
export function intersectTimeSlots(slot1: TimeSlot, slot2: TimeSlot): TimeSlot | null {
  if (!timeSlotsOverlap(slot1, slot2)) {
    return null;
  }
  
  return {
    startTime: Math.max(slot1.startTime, slot2.startTime),
    endTime: Math.min(slot1.endTime, slot2.endTime)
  };
}

/**
 * Subtract blocked time slots from available time slots
 * Returns array of available slots after removing blocked periods
 */
export function subtractTimeSlots(available: TimeSlot, blocked: TimeSlot[]): TimeSlot[] {
  const result: TimeSlot[] = [];
  let current = { ...available };
  
  // Sort blocked slots by start time
  const sortedBlocked = [...blocked].sort((a, b) => a.startTime - b.startTime);
  
  for (const block of sortedBlocked) {
    if (!timeSlotsOverlap(current, block)) {
      continue;
    }
    
    // If block starts after current start, add the gap before block
    if (block.startTime > current.startTime) {
      result.push({
        startTime: current.startTime,
        endTime: Math.min(block.startTime, current.endTime)
      });
    }
    
    // Move current start to after the block
    if (block.endTime < current.endTime) {
      current.startTime = block.endTime;
    } else {
      // Block covers the rest of the available slot
      return result;
    }
  }
  
  // Add remaining time if any
  if (current.startTime < current.endTime) {
    result.push(current);
  }
  
  return result;
}

/**
 * Find available time slots for a specific machine and date
 * considering machine schedule blocks
 */
export function getMachineAvailableSlots(
  date: Date,
  machineId: number,
  machineBlocks: MachineScheduleBlock[]
): TimeSlot[] {
  // Full day availability (0:00 to 24:00)
  const fullDay: TimeSlot = {
    startTime: 0,
    endTime: 1440 // 24 * 60 minutes
  };
  
  // Filter blocks for this machine and date
  const relevantBlocks = machineBlocks.filter(block => {
    const blockDate = new Date(block.date);
    return block.machineId === machineId && 
           blockDate.toDateString() === date.toDateString();
  });
  
  // Convert blocks to TimeSlots
  const blockedSlots: TimeSlot[] = relevantBlocks.map(block => ({
    startTime: block.startTime,
    endTime: block.endTime
  }));
  
  return subtractTimeSlots(fullDay, blockedSlots);
}

/**
 * Find available time slots for a specific staff member and date
 * considering their shifts
 */
export function getStaffAvailableSlots(
  date: Date,
  staffId: string,
  staffShifts: StaffShift[]
): TimeSlot[] {
  // Filter shifts for this staff member and date
  const relevantShifts = staffShifts.filter(shift => {
    // Must be for this specific staff member
    if (shift.staffId !== staffId) {
      return false;
    }
    
    const shiftDate = new Date(shift.date);
    
    // Check if it's a regular shift for this date
    if (shiftDate.toDateString() === date.toDateString()) {
      return true;
    }
    
    // Check if it's a recurring shift for this day of week
    if (shift.isRecurring && shift.recurringDaysOfWeek?.includes(date.getDay())) {
      return true;
    }
    
    return false;
  });
  
  // Convert shifts to TimeSlots
  return relevantShifts.map(shift => ({
    startTime: shift.startTime,
    endTime: shift.endTime
  }));
}

/**
 * Find staff machine allocation slots for a specific staff member, machine, and date
 * If there are allocations, staff can ONLY work on that machine during allocated times
 * If there are NO allocations, staff can work on any machine during their shifts
 */
export function getStaffMachineAllocationSlots(
  date: Date,
  machineId: number,
  staffId: string,
  staffMachineAllocations: StaffMachineAllocation[]
): TimeSlot[] | null {
  // Filter allocations for this staff member
  const staffAllocations = staffMachineAllocations.filter(allocation => {
    if (allocation.staffId !== staffId) {
      return false;
    }
    
    const allocationDate = new Date(allocation.date);
    
    // Check if it's a regular allocation for this date
    if (allocationDate.toDateString() === date.toDateString()) {
      return true;
    }
    
    // Check if it's a recurring allocation for this day of week
    if (allocation.isRecurring && allocation.recurringDaysOfWeek?.includes(date.getDay())) {
      return true;
    }
    
    return false;
  });
  
  // If there are no allocations for this staff member on this date, they can work on any machine
  if (staffAllocations.length === 0) {
    return null; // null means no restrictions
  }
  
  // Filter allocations for this specific machine
  const relevantAllocations = staffAllocations.filter(allocation => 
    allocation.machineId === machineId
  );
  
  // Convert allocations to TimeSlots
  return relevantAllocations.map(allocation => ({
    startTime: allocation.startTime,
    endTime: allocation.endTime
  }));
}

/**
 * Check if a date is a bank holiday
 */
export function isBankHoliday(
  date: Date,
  bankHolidays: BankHoliday[]
): boolean {
  return bankHolidays.some(holiday => {
    const holidayDate = new Date(holiday.date);
    return holidayDate.toDateString() === date.toDateString();
  });
}

/**
 * Check if a staff member is on holiday on a given date
 */
export function isStaffOnHoliday(
  date: Date,
  staffId: string,
  staffHolidays: StaffHoliday[]
): boolean {
  return staffHolidays.some(holiday => {
    if (holiday.staffId !== staffId) {
      return false;
    }
    
    const startDate = new Date(holiday.startDate);
    const endDate = new Date(holiday.endDate);
    
    // Set to start of day for accurate comparison
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);
    
    const checkDate = new Date(date);
    checkDate.setHours(12, 0, 0, 0); // Use noon to avoid timezone issues
    
    return checkDate >= startDate && checkDate <= endDate;
  });
}

/**
 * Find available time slots where both machine and staff are available
 */
export function findAvailableSlots(
  date: Date,
  machineId: number,
  staffId: string,
  machineBlocks: MachineScheduleBlock[],
  staffShifts: StaffShift[],
  jobSchedules: JobSchedule[],
  staffMachineAllocations: StaffMachineAllocation[] = [],
  staffHolidays: StaffHoliday[] = [],
  bankHolidays: BankHoliday[] = []
): TimeSlot[] {
  // Check if this is a bank holiday - no work on bank holidays
  if (isBankHoliday(date, bankHolidays)) {
    return [];
  }
  
  // Check if staff member is on holiday
  if (isStaffOnHoliday(date, staffId, staffHolidays)) {
    return [];
  }
  
  // Get machine available slots
  const machineSlots = getMachineAvailableSlots(date, machineId, machineBlocks);
  
  // Get staff available slots (based on shifts)
  const staffSlots = getStaffAvailableSlots(date, staffId, staffShifts);
  
  // Get staff machine allocation slots (restrictions on which machines staff can use)
  const allocationSlots = getStaffMachineAllocationSlots(date, machineId, staffId, staffMachineAllocations);
  
  // Find intersection of machine and staff availability
  let intersectedSlots: TimeSlot[] = [];
  for (const machineSlot of machineSlots) {
    for (const staffSlot of staffSlots) {
      const intersection = intersectTimeSlots(machineSlot, staffSlot);
      if (intersection) {
        intersectedSlots.push(intersection);
      }
    }
  }
  
  // If there are staff machine allocations, further intersect with those
  // (staff can only work on this machine during allocated times)
  if (allocationSlots !== null && allocationSlots.length > 0) {
    const allocatedIntersections: TimeSlot[] = [];
    for (const slot of intersectedSlots) {
      for (const allocationSlot of allocationSlots) {
        const intersection = intersectTimeSlots(slot, allocationSlot);
        if (intersection) {
          allocatedIntersections.push(intersection);
        }
      }
    }
    intersectedSlots = allocatedIntersections;
  } else if (allocationSlots !== null && allocationSlots.length === 0) {
    // Staff has allocations on this date, but not for this machine
    // Therefore, they cannot work on this machine
    return [];
  }
  
  // Filter out already scheduled jobs that conflict with this machine OR staff on this date
  // A conflict occurs if EITHER the machine is booked OR the staff member is booked
  const relevantSchedules = jobSchedules.filter(schedule => {
    const scheduleDate = new Date(schedule.scheduledDate);
    const isSameDate = scheduleDate.toDateString() === date.toDateString();
    const isNotCancelled = schedule.status !== 'cancelled';
    const isMachineConflict = schedule.machineId === machineId;
    const isStaffConflict = schedule.staffId === staffId;
    
    return isSameDate && isNotCancelled && (isMachineConflict || isStaffConflict);
  });
  
  // Subtract scheduled jobs from available slots
  let finalSlots: TimeSlot[] = [];
  for (const slot of intersectedSlots) {
    const scheduledSlots: TimeSlot[] = relevantSchedules.map(s => ({
      startTime: s.startTime,
      endTime: s.endTime
    }));
    const available = subtractTimeSlots(slot, scheduledSlots);
    finalSlots = finalSlots.concat(available);
  }
  
  return finalSlots;
}

/**
 * Find the earliest available time slot that can fit a job with given duration
 */
export function findEarliestSlot(
  startDate: Date,
  endDate: Date,
  machineId: number,
  staffId: string,
  durationMinutes: number,
  machineBlocks: MachineScheduleBlock[],
  staffShifts: StaffShift[],
  jobSchedules: JobSchedule[],
  staffMachineAllocations: StaffMachineAllocation[] = []
): AvailableSlot | null {
  const currentDate = new Date(startDate);
  
  while (currentDate <= endDate) {
    const availableSlots = findAvailableSlots(
      currentDate,
      machineId,
      staffId,
      machineBlocks,
      staffShifts,
      jobSchedules,
      staffMachineAllocations
    );
    
    // Find first slot that fits the duration
    for (const slot of availableSlots) {
      const slotDuration = slot.endTime - slot.startTime;
      if (slotDuration >= durationMinutes) {
        return {
          date: new Date(currentDate),
          machineId,
          staffId,
          startTime: slot.startTime,
          endTime: slot.startTime + durationMinutes
        };
      }
    }
    
    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return null;
}

/**
 * Calculate job duration in minutes from job specifications
 */
export function calculateJobDuration(
  quantity: number,
  stitchCount: number,
  machineId: number
): number {
  const metrics = calculateProductionMetrics(quantity, stitchCount, machineId);
  return metrics?.totalTimeMinutes || 0;
}

/**
 * Check if a job can be scheduled at a specific time
 */
export function canScheduleJob(
  date: Date,
  startTime: number,
  endTime: number,
  machineId: number,
  staffId: string,
  machineBlocks: MachineScheduleBlock[],
  staffShifts: StaffShift[],
  jobSchedules: JobSchedule[],
  staffMachineAllocations: StaffMachineAllocation[] = []
): boolean {
  const requestedSlot: TimeSlot = { startTime, endTime };
  
  const availableSlots = findAvailableSlots(
    date,
    machineId,
    staffId,
    machineBlocks,
    staffShifts,
    jobSchedules,
    staffMachineAllocations
  );
  
  // Check if requested slot fits within any available slot
  for (const availableSlot of availableSlots) {
    if (requestedSlot.startTime >= availableSlot.startTime && 
        requestedSlot.endTime <= availableSlot.endTime) {
      return true;
    }
  }
  
  return false;
}
