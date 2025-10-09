import type { StaffShift, MachineScheduleBlock, JobSchedule } from "./schema";
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
    if (shift.isRecurring && shift.recurringDayOfWeek === date.getDay()) {
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
 * Find available time slots where both machine and staff are available
 */
export function findAvailableSlots(
  date: Date,
  machineId: number,
  staffId: string,
  machineBlocks: MachineScheduleBlock[],
  staffShifts: StaffShift[],
  jobSchedules: JobSchedule[]
): TimeSlot[] {
  // Get machine available slots
  const machineSlots = getMachineAvailableSlots(date, machineId, machineBlocks);
  
  // Get staff available slots
  const staffSlots = getStaffAvailableSlots(date, staffId, staffShifts);
  
  // Find intersection of machine and staff availability
  const intersectedSlots: TimeSlot[] = [];
  for (const machineSlot of machineSlots) {
    for (const staffSlot of staffSlots) {
      const intersection = intersectTimeSlots(machineSlot, staffSlot);
      if (intersection) {
        intersectedSlots.push(intersection);
      }
    }
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
  jobSchedules: JobSchedule[]
): AvailableSlot | null {
  const currentDate = new Date(startDate);
  
  while (currentDate <= endDate) {
    const availableSlots = findAvailableSlots(
      currentDate,
      machineId,
      staffId,
      machineBlocks,
      staffShifts,
      jobSchedules
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
  jobSchedules: JobSchedule[]
): boolean {
  const requestedSlot: TimeSlot = { startTime, endTime };
  
  const availableSlots = findAvailableSlots(
    date,
    machineId,
    staffId,
    machineBlocks,
    staffShifts,
    jobSchedules
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
