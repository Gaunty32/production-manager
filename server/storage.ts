import { 
  customers, 
  jobs, 
  users, 
  staff,
  staffShifts,
  machineScheduleBlocks,
  jobSchedule,
  jobLineItems,
  staffMachineAllocations,
  type Customer, 
  type InsertCustomer, 
  type Job, 
  type InsertJob, 
  type User, 
  type UpsertUser, 
  type Staff, 
  type InsertStaff,
  type StaffShift,
  type InsertStaffShift,
  type MachineScheduleBlock,
  type InsertMachineScheduleBlock,
  type JobSchedule,
  type InsertJobSchedule,
  type JobLineItem,
  type InsertJobLineItem,
  type StaffMachineAllocation,
  type InsertStaffMachineAllocation
} from "@shared/schema";
import { db } from "./db";
import { eq, and, gte, lte } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  getCustomers(): Promise<Customer[]>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomer(id: string, customer: Partial<Customer>): Promise<Customer>;
  deleteCustomer(id: string): Promise<void>;
  getStaff(): Promise<Staff[]>;
  createStaff(staffMember: InsertStaff): Promise<Staff>;
  updateStaff(id: string, staffMember: Partial<Staff>): Promise<Staff>;
  deleteStaff(id: string): Promise<void>;
  getJob(id: string): Promise<Job | undefined>;
  getJobs(): Promise<Job[]>;
  getJobsByMachine(machineId: number): Promise<Job[]>;
  createJob(job: InsertJob): Promise<Job>;
  updateJob(id: string, job: Partial<Job>): Promise<Job>;
  deleteJob(id: string): Promise<void>;
  
  getStaffShifts(staffId?: string, startDate?: Date, endDate?: Date): Promise<StaffShift[]>;
  createStaffShift(shift: InsertStaffShift): Promise<StaffShift>;
  updateStaffShift(id: string, shift: Partial<StaffShift>): Promise<StaffShift>;
  deleteStaffShift(id: string): Promise<void>;
  
  getMachineScheduleBlocks(machineId?: number, startDate?: Date, endDate?: Date): Promise<MachineScheduleBlock[]>;
  createMachineScheduleBlock(block: InsertMachineScheduleBlock): Promise<MachineScheduleBlock>;
  updateMachineScheduleBlock(id: string, block: Partial<MachineScheduleBlock>): Promise<MachineScheduleBlock>;
  deleteMachineScheduleBlock(id: string): Promise<void>;
  
  getJobSchedules(jobId?: string, machineId?: number, staffId?: string, startDate?: Date, endDate?: Date): Promise<JobSchedule[]>;
  createJobSchedule(schedule: InsertJobSchedule): Promise<JobSchedule>;
  updateJobSchedule(id: string, schedule: Partial<JobSchedule>): Promise<JobSchedule>;
  deleteJobSchedule(id: string): Promise<void>;
  
  getJobLineItems(jobId: string): Promise<JobLineItem[]>;
  createJobLineItem(lineItem: InsertJobLineItem): Promise<JobLineItem>;
  updateJobLineItem(id: string, lineItem: Partial<JobLineItem>): Promise<JobLineItem>;
  deleteJobLineItem(id: string): Promise<void>;
  
  getStaffMachineAllocations(staffId?: string, machineId?: number, startDate?: Date, endDate?: Date): Promise<StaffMachineAllocation[]>;
  createStaffMachineAllocation(allocation: InsertStaffMachineAllocation): Promise<StaffMachineAllocation>;
  updateStaffMachineAllocation(id: string, allocation: Partial<StaffMachineAllocation>): Promise<StaffMachineAllocation>;
  deleteStaffMachineAllocation(id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async getCustomers(): Promise<Customer[]> {
    return await db.select().from(customers);
  }

  async createCustomer(insertCustomer: InsertCustomer): Promise<Customer> {
    const [customer] = await db
      .insert(customers)
      .values(insertCustomer)
      .returning();
    return customer;
  }

  async updateCustomer(id: string, updates: Partial<Customer>): Promise<Customer> {
    const [customer] = await db
      .update(customers)
      .set(updates)
      .where(eq(customers.id, id))
      .returning();
    return customer;
  }

  async deleteCustomer(id: string): Promise<void> {
    const customerJobs = await db.select().from(jobs).where(eq(jobs.customerId, id));
    if (customerJobs.length > 0) {
      throw new Error("Cannot delete customer with existing jobs");
    }
    await db.delete(customers).where(eq(customers.id, id));
  }

  async getStaff(): Promise<Staff[]> {
    return await db.select().from(staff);
  }

  async createStaff(insertStaff: InsertStaff): Promise<Staff> {
    const [staffMember] = await db
      .insert(staff)
      .values(insertStaff)
      .returning();
    return staffMember;
  }

  async updateStaff(id: string, updates: Partial<Staff>): Promise<Staff> {
    const [staffMember] = await db
      .update(staff)
      .set(updates)
      .where(eq(staff.id, id))
      .returning();
    return staffMember;
  }

  async deleteStaff(id: string): Promise<void> {
    await db
      .update(jobs)
      .set({ completedById: null })
      .where(eq(jobs.completedById, id));
    
    await db.delete(staff).where(eq(staff.id, id));
  }

  async getJob(id: string): Promise<Job | undefined> {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
    return job;
  }

  async getJobs(): Promise<Job[]> {
    return await db.select().from(jobs);
  }

  async getJobsByMachine(machineId: number): Promise<Job[]> {
    return await db.select().from(jobs).where(eq(jobs.machineId, machineId));
  }

  async createJob(insertJob: InsertJob): Promise<Job> {
    const [job] = await db
      .insert(jobs)
      .values({
        ...insertJob,
        dateReceived: new Date(insertJob.dateReceived),
        requiredDispatchDate: new Date(insertJob.requiredDispatchDate),
      })
      .returning();
    return job;
  }

  async updateJob(id: string, updates: Partial<Job>): Promise<Job> {
    const [job] = await db
      .update(jobs)
      .set(updates)
      .where(eq(jobs.id, id))
      .returning();
    
    if (!job) throw new Error("Job not found");
    return job;
  }

  async deleteJob(id: string): Promise<void> {
    await db.delete(jobs).where(eq(jobs.id, id));
  }

  async getStaffShifts(staffId?: string, startDate?: Date, endDate?: Date): Promise<StaffShift[]> {
    const conditions = [];
    if (staffId) {
      conditions.push(eq(staffShifts.staffId, staffId));
    }
    if (startDate) {
      conditions.push(gte(staffShifts.date, startDate));
    }
    if (endDate) {
      conditions.push(lte(staffShifts.date, endDate));
    }
    
    if (conditions.length === 0) {
      return await db.select().from(staffShifts);
    }
    return await db.select().from(staffShifts).where(and(...conditions));
  }

  async createStaffShift(insertShift: InsertStaffShift): Promise<StaffShift> {
    const [shift] = await db
      .insert(staffShifts)
      .values({
        ...insertShift,
        date: new Date(insertShift.date),
      })
      .returning();
    return shift;
  }

  async updateStaffShift(id: string, updates: Partial<StaffShift>): Promise<StaffShift> {
    const [shift] = await db
      .update(staffShifts)
      .set(updates)
      .where(eq(staffShifts.id, id))
      .returning();
    if (!shift) throw new Error("Shift not found");
    return shift;
  }

  async deleteStaffShift(id: string): Promise<void> {
    await db.delete(staffShifts).where(eq(staffShifts.id, id));
  }

  async getMachineScheduleBlocks(machineId?: number, startDate?: Date, endDate?: Date): Promise<MachineScheduleBlock[]> {
    const conditions = [];
    if (machineId) {
      conditions.push(eq(machineScheduleBlocks.machineId, machineId));
    }
    if (startDate) {
      conditions.push(gte(machineScheduleBlocks.date, startDate));
    }
    if (endDate) {
      conditions.push(lte(machineScheduleBlocks.date, endDate));
    }
    
    if (conditions.length === 0) {
      return await db.select().from(machineScheduleBlocks);
    }
    return await db.select().from(machineScheduleBlocks).where(and(...conditions));
  }

  async createMachineScheduleBlock(insertBlock: InsertMachineScheduleBlock): Promise<MachineScheduleBlock> {
    const [block] = await db
      .insert(machineScheduleBlocks)
      .values({
        ...insertBlock,
        date: new Date(insertBlock.date),
      })
      .returning();
    return block;
  }

  async updateMachineScheduleBlock(id: string, updates: Partial<MachineScheduleBlock>): Promise<MachineScheduleBlock> {
    const [block] = await db
      .update(machineScheduleBlocks)
      .set(updates)
      .where(eq(machineScheduleBlocks.id, id))
      .returning();
    if (!block) throw new Error("Schedule block not found");
    return block;
  }

  async deleteMachineScheduleBlock(id: string): Promise<void> {
    await db.delete(machineScheduleBlocks).where(eq(machineScheduleBlocks.id, id));
  }

  async getJobSchedules(jobId?: string, machineId?: number, staffId?: string, startDate?: Date, endDate?: Date): Promise<JobSchedule[]> {
    const conditions = [];
    if (jobId) {
      conditions.push(eq(jobSchedule.jobId, jobId));
    }
    if (machineId) {
      conditions.push(eq(jobSchedule.machineId, machineId));
    }
    if (staffId) {
      conditions.push(eq(jobSchedule.staffId, staffId));
    }
    if (startDate) {
      conditions.push(gte(jobSchedule.scheduledDate, startDate));
    }
    if (endDate) {
      conditions.push(lte(jobSchedule.scheduledDate, endDate));
    }
    
    if (conditions.length === 0) {
      return await db.select().from(jobSchedule);
    }
    return await db.select().from(jobSchedule).where(and(...conditions));
  }

  async createJobSchedule(insertSchedule: InsertJobSchedule): Promise<JobSchedule> {
    const [schedule] = await db
      .insert(jobSchedule)
      .values({
        ...insertSchedule,
        scheduledDate: new Date(insertSchedule.scheduledDate),
      })
      .returning();
    return schedule;
  }

  async updateJobSchedule(id: string, updates: Partial<JobSchedule>): Promise<JobSchedule> {
    const [schedule] = await db
      .update(jobSchedule)
      .set(updates)
      .where(eq(jobSchedule.id, id))
      .returning();
    if (!schedule) throw new Error("Job schedule not found");
    return schedule;
  }

  async deleteJobSchedule(id: string): Promise<void> {
    await db.delete(jobSchedule).where(eq(jobSchedule.id, id));
  }

  async getJobLineItems(jobId: string): Promise<JobLineItem[]> {
    return await db.select().from(jobLineItems).where(eq(jobLineItems.jobId, jobId));
  }

  async createJobLineItem(insertLineItem: InsertJobLineItem): Promise<JobLineItem> {
    const [lineItem] = await db
      .insert(jobLineItems)
      .values(insertLineItem)
      .returning();
    return lineItem;
  }

  async updateJobLineItem(id: string, updates: Partial<JobLineItem>): Promise<JobLineItem> {
    const [lineItem] = await db
      .update(jobLineItems)
      .set(updates)
      .where(eq(jobLineItems.id, id))
      .returning();
    if (!lineItem) throw new Error("Line item not found");
    return lineItem;
  }

  async deleteJobLineItem(id: string): Promise<void> {
    await db.delete(jobLineItems).where(eq(jobLineItems.id, id));
  }

  async getStaffMachineAllocations(staffId?: string, machineId?: number, startDate?: Date, endDate?: Date): Promise<StaffMachineAllocation[]> {
    const conditions = [];
    if (staffId) {
      conditions.push(eq(staffMachineAllocations.staffId, staffId));
    }
    if (machineId) {
      conditions.push(eq(staffMachineAllocations.machineId, machineId));
    }
    if (startDate) {
      conditions.push(gte(staffMachineAllocations.date, startDate));
    }
    if (endDate) {
      conditions.push(lte(staffMachineAllocations.date, endDate));
    }
    
    if (conditions.length === 0) {
      return await db.select().from(staffMachineAllocations);
    }
    return await db.select().from(staffMachineAllocations).where(and(...conditions));
  }

  async createStaffMachineAllocation(insertAllocation: InsertStaffMachineAllocation): Promise<StaffMachineAllocation> {
    const [allocation] = await db
      .insert(staffMachineAllocations)
      .values({
        ...insertAllocation,
        date: new Date(insertAllocation.date),
      })
      .returning();
    return allocation;
  }

  async updateStaffMachineAllocation(id: string, updates: Partial<StaffMachineAllocation>): Promise<StaffMachineAllocation> {
    const [allocation] = await db
      .update(staffMachineAllocations)
      .set(updates)
      .where(eq(staffMachineAllocations.id, id))
      .returning();
    if (!allocation) throw new Error("Staff machine allocation not found");
    return allocation;
  }

  async deleteStaffMachineAllocation(id: string): Promise<void> {
    await db.delete(staffMachineAllocations).where(eq(staffMachineAllocations.id, id));
  }
}

export const storage = new DatabaseStorage();
