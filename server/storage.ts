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
  userStars,
  logoSetups,
  customerUsers,
  jobMessages,
  jobFiles,
  passwordResetTokens,
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
  type InsertStaffMachineAllocation,
  type LogoSetup,
  type InsertLogoSetup,
  type CustomerUser,
  type JobMessage,
  type InsertJobMessage,
  type JobFile,
  type InsertJobFile
} from "@shared/schema";
import { db } from "./db";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { MACHINE_HEADS } from "@shared/machines";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  createUser(user: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserRole(id: string, role: string): Promise<User>;
  updateUser(id: string, updates: { username?: string; email?: string; firstName?: string; lastName?: string }): Promise<User>;
  updateUserUsername(id: string, username: string): Promise<void>;
  ensureUsernameColumn(): Promise<void>;
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
  getJobsByCustomerId(customerId: string): Promise<Job[]>;
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
  
  getAllJobLineItems(): Promise<JobLineItem[]>;
  getJobLineItems(jobId: string): Promise<JobLineItem[]>;
  createJobLineItem(lineItem: InsertJobLineItem): Promise<JobLineItem>;
  updateJobLineItem(id: string, lineItem: Partial<JobLineItem>): Promise<JobLineItem>;
  deleteJobLineItem(id: string): Promise<void>;
  
  getStaffMachineAllocations(staffId?: string, machineId?: number, startDate?: Date, endDate?: Date): Promise<StaffMachineAllocation[]>;
  createStaffMachineAllocation(allocation: InsertStaffMachineAllocation): Promise<StaffMachineAllocation>;
  updateStaffMachineAllocation(id: string, allocation: Partial<StaffMachineAllocation>): Promise<StaffMachineAllocation>;
  deleteStaffMachineAllocation(id: string): Promise<void>;
  
  awardStar(userId: string, starType: "yellow" | "red"): Promise<any>;
  getStarsLeaderboard(): Promise<any[]>;
  getStaffProductionMetrics(staffId?: string): Promise<any[]>;
  
  getLogoSetups(): Promise<LogoSetup[]>;
  createLogoSetup(logoSetup: InsertLogoSetup): Promise<LogoSetup>;
  updateLogoSetup(id: string, logoSetup: Partial<LogoSetup>): Promise<LogoSetup>;
  deleteLogoSetup(id: string): Promise<void>;
  
  // Customer portal methods
  createCustomerUser(customerUser: Omit<CustomerUser, 'id' | 'createdAt' | 'lastLoginAt'> & { mustResetPassword?: boolean; active?: boolean }): Promise<CustomerUser>;
  getCustomerUserById(id: string): Promise<CustomerUser | undefined>;
  getCustomerUserByEmail(email: string): Promise<CustomerUser | undefined>;
  getCustomerUsersByCustomerId(customerId: string): Promise<CustomerUser[]>;
  updateCustomerLastLogin(id: string): Promise<void>;
  updateCustomerPassword(id: string, passwordHash: string): Promise<void>;
  updateCustomerActive(id: string, active: boolean): Promise<void>;
  updateCustomerMustResetPassword(id: string, mustResetPassword: boolean): Promise<void>;
  getJobMessages(jobId: string): Promise<JobMessage[]>;
  createJobMessage(message: InsertJobMessage): Promise<JobMessage>;
  markMessagesAsRead(jobId: string, readerType: 'staff' | 'customer'): Promise<void>;
  getJobFiles(jobId: string): Promise<JobFile[]>;
  createJobFile(file: InsertJobFile): Promise<JobFile>;
  deleteJobFile(id: string): Promise<void>;
  
  // Password reset methods
  createPasswordResetToken(data: { userId: string; token: string; expiresAt: Date }): Promise<any>;
  getPasswordResetToken(token: string): Promise<any | undefined>;
  updateUserPassword(userId: string, passwordHash: string): Promise<void>;
  markPasswordResetTokenUsed(tokenId: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async createUser(userData: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .returning();
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

  async updateUserRole(id: string, role: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateUser(id: string, updates: { username?: string; email?: string; firstName?: string; lastName?: string }): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateUserUsername(id: string, username: string): Promise<void> {
    await db
      .update(users)
      .set({ username, updatedAt: new Date() })
      .where(eq(users.id, id));
  }

  async ensureUsernameColumn(): Promise<void> {
    try {
      // Add username column if it doesn't exist
      await db.execute(sql`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS username VARCHAR(255)
      `);
    } catch (error) {
      console.error("Error adding username column:", error);
      // Column might already exist, which is fine
    }
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

  async getJobsByCustomerId(customerId: string): Promise<Job[]> {
    return await db.select().from(jobs).where(eq(jobs.customerId, customerId));
  }

  async createJob(insertJob: InsertJob): Promise<Job> {
    // Get the maximum job number and increment by 1
    const maxJobNumberResult = await db
      .select({ maxJobNumber: sql<number>`COALESCE(MAX(job_number), 0)` })
      .from(jobs);
    const nextJobNumber = (maxJobNumberResult[0]?.maxJobNumber || 0) + 1;
    
    const [job] = await db
      .insert(jobs)
      .values({
        ...insertJob,
        jobNumber: nextJobNumber,
        goodsReceived: insertJob.goodsReceived ? new Date(insertJob.goodsReceived) : null,
        requiredDispatchDate: insertJob.requiredDispatchDate ? new Date(insertJob.requiredDispatchDate) : null,
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

  async getAllJobLineItems(): Promise<JobLineItem[]> {
    return await db.select().from(jobLineItems);
  }

  async getJobLineItems(jobId: string): Promise<JobLineItem[]> {
    return await db.select().from(jobLineItems).where(eq(jobLineItems.jobId, jobId));
  }

  async createJobLineItem(insertLineItem: InsertJobLineItem): Promise<JobLineItem> {
    const [lineItem] = await db
      .insert(jobLineItems)
      .values({
        ...insertLineItem,
        completedAt: insertLineItem.completedAt ? new Date(insertLineItem.completedAt) : null,
      })
      .returning();
    return lineItem;
  }

  async updateJobLineItem(id: string, updates: Partial<JobLineItem>): Promise<JobLineItem> {
    // Handle date conversion for completedAt if it's a string
    const processedUpdates = {
      ...updates,
      ...(updates.completedAt && typeof updates.completedAt === 'string' 
        ? { completedAt: new Date(updates.completedAt) } 
        : {}),
    };
    
    const [lineItem] = await db
      .update(jobLineItems)
      .set(processedUpdates)
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

  async awardStar(userId: string, starType: "yellow" | "red"): Promise<any> {
    const [existingStars] = await db
      .select()
      .from(userStars)
      .where(eq(userStars.userId, userId));

    if (existingStars) {
      const updates = starType === "yellow" 
        ? { yellowStars: sql`${userStars.yellowStars} + 1` }
        : { redStars: sql`${userStars.redStars} + 1` };
      
      const [updated] = await db
        .update(userStars)
        .set(updates)
        .where(eq(userStars.userId, userId))
        .returning();
      return updated;
    } else {
      const [newStars] = await db
        .insert(userStars)
        .values({
          userId,
          yellowStars: starType === "yellow" ? 1 : 0,
          redStars: starType === "red" ? 1 : 0,
        })
        .returning();
      return newStars;
    }
  }

  async getStarsLeaderboard(): Promise<any[]> {
    const leaderboard = await db
      .select({
        userId: userStars.userId,
        yellowStars: userStars.yellowStars,
        redStars: userStars.redStars,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      })
      .from(userStars)
      .leftJoin(users, eq(userStars.userId, users.id))
      .orderBy(sql`${userStars.yellowStars} + ${userStars.redStars} DESC`);
    
    return leaderboard;
  }

  async getStaffProductionMetrics(staffId?: string): Promise<any[]> {
    // Get all completed jobs with their associated staff and line items
    let completedJobs;
    
    if (staffId) {
      completedJobs = await db
        .select({
          staffId: jobs.completedById,
          jobId: jobs.id,
          machineId: jobs.machineId,
        })
        .from(jobs)
        .where(and(eq(jobs.completed, true), eq(jobs.completedById, staffId)));
    } else {
      completedJobs = await db
        .select({
          staffId: jobs.completedById,
          jobId: jobs.id,
          machineId: jobs.machineId,
        })
        .from(jobs)
        .where(eq(jobs.completed, true));
    }

    // Group by staff and calculate metrics (accounting for machine heads)
    const staffMetrics: Record<string, { 
      totalStitches: number; 
      totalMinutes: number;
      totalHeadHours: number; // Track head-hours for normalized calculation
    }> = {};

    for (const job of completedJobs) {
      if (!job.staffId) continue;

      if (!staffMetrics[job.staffId]) {
        staffMetrics[job.staffId] = { totalStitches: 0, totalMinutes: 0, totalHeadHours: 0 };
      }

      // Get line items for this job
      const lineItems = await db
        .select()
        .from(jobLineItems)
        .where(eq(jobLineItems.jobId, job.jobId));

      // Calculate total stitches from line items
      const jobStitches = lineItems.reduce((sum, item) => {
        return sum + (item.stitchCount * item.quantity);
      }, 0);

      staffMetrics[job.staffId].totalStitches += jobStitches;

      // Try to get actual time from job schedule
      const schedules = await db
        .select()
        .from(jobSchedule)
        .where(and(
          eq(jobSchedule.jobId, job.jobId),
          eq(jobSchedule.staffId, job.staffId)
        ));

      if (schedules.length > 0) {
        // Use actual scheduled time and factor in machine heads
        for (const schedule of schedules) {
          const jobMinutes = schedule.endTime - schedule.startTime;
          const machineHeads = MACHINE_HEADS[schedule.machineId] || 6; // Default to 6 heads
          const headHours = (jobMinutes / 60) * machineHeads;
          
          staffMetrics[job.staffId].totalMinutes += jobMinutes;
          staffMetrics[job.staffId].totalHeadHours += headHours;
        }
      } else if (job.machineId && jobStitches > 0) {
        // Fall back to calculated production time
        const STITCHES_PER_MINUTE = 750;
        const CHANGEOVER_TIME_MINUTES = 3;
        const machineHeads = MACHINE_HEADS[job.machineId] || 6;
        
        const totalQuantity = lineItems.reduce((sum, item) => sum + item.quantity, 0);
        const runs = Math.ceil(totalQuantity / machineHeads);
        const avgStitchCount = jobStitches / totalQuantity;
        const embroideryTimePerRun = avgStitchCount / STITCHES_PER_MINUTE;
        const timePerRunMinutes = embroideryTimePerRun + CHANGEOVER_TIME_MINUTES;
        const totalMinutes = Math.ceil((runs * timePerRunMinutes) / 10) * 10;
        const headHours = (totalMinutes / 60) * machineHeads;
        
        staffMetrics[job.staffId].totalMinutes += totalMinutes;
        staffMetrics[job.staffId].totalHeadHours += headHours;
      }
    }

    // Convert to array with stitches per hour (normalized by machine heads)
    const metrics = await Promise.all(
      Object.entries(staffMetrics).map(async ([staffId, data]) => {
        const staffMember = await db.select().from(staff).where(eq(staff.id, staffId)).limit(1);
        const hours = data.totalMinutes / 60;
        
        // Calculate normalized stitches per head-hour (accounts for machine capacity)
        const stitchesPerHeadHour = data.totalHeadHours > 0 
          ? Math.round(data.totalStitches / data.totalHeadHours) 
          : 0;

        // Get user details if staff has a linked userId
        let firstName = '';
        let lastName = '';
        let email = '';
        
        if (staffMember[0]?.userId) {
          const user = await db.select().from(users).where(eq(users.id, staffMember[0].userId)).limit(1);
          if (user[0]) {
            firstName = user[0].firstName || '';
            lastName = user[0].lastName || '';
            email = user[0].email || '';
          }
        }

        return {
          staffId,
          staffName: staffMember[0]?.name || 'Unknown',
          userId: staffMember[0]?.userId || null,
          firstName,
          lastName,
          email,
          totalStitches: data.totalStitches,
          totalHours: Math.round(hours * 10) / 10,
          stitchesPerHour: stitchesPerHeadHour, // Now normalized by machine heads
        };
      })
    );

    return metrics.sort((a, b) => b.stitchesPerHour - a.stitchesPerHour);
  }

  async getDailyStaffProductionMetrics(): Promise<any[]> {
    // Get all completed line items with associated job and staff information
    const completedLineItems = await db
      .select({
        lineItemId: jobLineItems.id,
        jobId: jobLineItems.jobId,
        completedById: jobLineItems.completedById,
        completedAt: jobLineItems.completedAt,
        stitchCount: jobLineItems.stitchCount,
        quantity: jobLineItems.quantity,
        machineId: jobLineItems.machineId,
        jobName: jobs.jobName,
        customerId: jobs.customerId,
      })
      .from(jobLineItems)
      .leftJoin(jobs, eq(jobLineItems.jobId, jobs.id))
      .where(and(
        eq(jobLineItems.completed, true),
        sql`${jobLineItems.completedById} IS NOT NULL`,
        sql`${jobLineItems.completedAt} IS NOT NULL`
      ));

    // Group by staff ID and date (YYYY-MM-DD)
    const dailyMetrics: Record<string, Record<string, {
      jobsCompleted: Set<string>;
      totalStitches: number;
      totalItems: number;
      totalMinutes: number;
      machineTypes: Record<string, number>; // Track time per machine type
    }>> = {};

    for (const item of completedLineItems) {
      if (!item.completedById || !item.completedAt) continue;

      const staffId = item.completedById;
      const completedDate = new Date(item.completedAt);
      const dateKey = completedDate.toISOString().split('T')[0]; // YYYY-MM-DD

      if (!dailyMetrics[staffId]) {
        dailyMetrics[staffId] = {};
      }
      if (!dailyMetrics[staffId][dateKey]) {
        dailyMetrics[staffId][dateKey] = {
          jobsCompleted: new Set(),
          totalStitches: 0,
          totalItems: 0,
          totalMinutes: 0,
          machineTypes: {},
        };
      }

      const dayData = dailyMetrics[staffId][dateKey];
      
      // Track unique jobs completed
      if (item.jobId) {
        dayData.jobsCompleted.add(item.jobId);
      }

      // Calculate stitches and items
      const lineItemStitches = (item.stitchCount || 0) * (item.quantity || 0);
      dayData.totalStitches += lineItemStitches;
      dayData.totalItems += item.quantity || 0;

      // Calculate production time based on machine
      if (item.machineId && lineItemStitches > 0) {
        const STITCHES_PER_MINUTE = 750;
        const CHANGEOVER_TIME_MINUTES = 3;
        const machineHeads = MACHINE_HEADS[item.machineId] || 6;
        
        const runs = Math.ceil((item.quantity || 0) / machineHeads);
        const embroideryTimePerRun = (item.stitchCount || 0) / STITCHES_PER_MINUTE;
        const timePerRunMinutes = embroideryTimePerRun + CHANGEOVER_TIME_MINUTES;
        const totalMinutes = Math.ceil((runs * timePerRunMinutes) / 10) * 10;
        
        dayData.totalMinutes += totalMinutes;
        
        // Track which machine type was used
        const machineType = machineHeads === 8 ? '8-head' : '6-head';
        dayData.machineTypes[machineType] = (dayData.machineTypes[machineType] || 0) + totalMinutes;
      }
    }

    // Convert to array format with detailed stats
    const results: any[] = [];
    
    for (const [staffId, dates] of Object.entries(dailyMetrics)) {
      // Get staff and user info
      const staffMember = await db.select().from(staff).where(eq(staff.id, staffId)).limit(1);
      if (!staffMember[0]) continue;

      let userInfo = {
        firstName: '',
        lastName: '',
        email: '',
      };

      if (staffMember[0].userId) {
        const user = await db.select().from(users).where(eq(users.id, staffMember[0].userId)).limit(1);
        if (user[0]) {
          userInfo = {
            firstName: user[0].firstName || '',
            lastName: user[0].lastName || '',
            email: user[0].email || '',
          };
        }
      }

      // Process each day's metrics
      for (const [date, data] of Object.entries(dates)) {
        const hours = data.totalMinutes / 60;
        const stitchesPerHour = hours > 0 ? Math.round(data.totalStitches / hours) : 0;

        results.push({
          staffId,
          staffName: staffMember[0].name,
          userId: staffMember[0].userId,
          ...userInfo,
          date,
          jobsCompleted: data.jobsCompleted.size,
          totalStitches: data.totalStitches,
          totalItems: data.totalItems,
          totalHours: Math.round(hours * 10) / 10,
          stitchesPerHour,
          machineTypes: data.machineTypes,
        });
      }
    }

    // Sort by date (most recent first), then by stitches per hour
    return results.sort((a, b) => {
      if (a.date !== b.date) {
        return b.date.localeCompare(a.date);
      }
      return b.stitchesPerHour - a.stitchesPerHour;
    });
  }

  async getLogoSetups(): Promise<LogoSetup[]> {
    return await db.select().from(logoSetups);
  }

  async createLogoSetup(insertLogoSetup: InsertLogoSetup): Promise<LogoSetup> {
    const [logoSetup] = await db
      .insert(logoSetups)
      .values(insertLogoSetup)
      .returning();
    return logoSetup;
  }

  async updateLogoSetup(id: string, updateData: Partial<LogoSetup>): Promise<LogoSetup> {
    const [logoSetup] = await db
      .update(logoSetups)
      .set(updateData)
      .where(eq(logoSetups.id, id))
      .returning();
    return logoSetup;
  }

  async deleteLogoSetup(id: string): Promise<void> {
    await db.delete(logoSetups).where(eq(logoSetups.id, id));
  }

  // Customer portal methods
  async createCustomerUser(customerUser: Omit<CustomerUser, 'id' | 'createdAt' | 'lastLoginAt'>): Promise<CustomerUser> {
    const [user] = await db
      .insert(customerUsers)
      .values(customerUser)
      .returning();
    return user;
  }

  async getCustomerUserById(id: string): Promise<CustomerUser | undefined> {
    const [user] = await db.select().from(customerUsers).where(eq(customerUsers.id, id));
    return user;
  }

  async getCustomerUserByEmail(email: string): Promise<CustomerUser | undefined> {
    const [user] = await db.select().from(customerUsers).where(eq(customerUsers.email, email));
    return user;
  }

  async getCustomerUsersByCustomerId(customerId: string): Promise<CustomerUser[]> {
    return await db.select().from(customerUsers).where(eq(customerUsers.customerId, customerId));
  }

  async updateCustomerLastLogin(id: string): Promise<void> {
    await db
      .update(customerUsers)
      .set({ lastLoginAt: new Date() })
      .where(eq(customerUsers.id, id));
  }

  async updateCustomerActive(id: string, active: boolean): Promise<void> {
    await db
      .update(customerUsers)
      .set({ active })
      .where(eq(customerUsers.id, id));
  }

  async updateCustomerMustResetPassword(id: string, mustResetPassword: boolean): Promise<void> {
    await db
      .update(customerUsers)
      .set({ mustResetPassword })
      .where(eq(customerUsers.id, id));
  }

  async updateCustomerPassword(id: string, passwordHash: string): Promise<void> {
    await db
      .update(customerUsers)
      .set({ passwordHash, mustResetPassword: false })
      .where(eq(customerUsers.id, id));
  }

  async getJobMessages(jobId: string): Promise<JobMessage[]> {
    return await db.select().from(jobMessages).where(eq(jobMessages.jobId, jobId));
  }

  async createJobMessage(message: InsertJobMessage): Promise<JobMessage> {
    const [newMessage] = await db
      .insert(jobMessages)
      .values(message)
      .returning();
    return newMessage;
  }

  async markMessagesAsRead(jobId: string, readerType: 'staff' | 'customer'): Promise<void> {
    if (readerType === 'staff') {
      await db
        .update(jobMessages)
        .set({ readByStaff: true })
        .where(eq(jobMessages.jobId, jobId));
    } else {
      await db
        .update(jobMessages)
        .set({ readByCustomer: true })
        .where(eq(jobMessages.jobId, jobId));
    }
  }

  async getJobFiles(jobId: string): Promise<JobFile[]> {
    return await db.select().from(jobFiles).where(eq(jobFiles.jobId, jobId));
  }

  async createJobFile(file: InsertJobFile): Promise<JobFile> {
    const [newFile] = await db
      .insert(jobFiles)
      .values(file)
      .returning();
    return newFile;
  }

  async deleteJobFile(id: string): Promise<void> {
    await db.delete(jobFiles).where(eq(jobFiles.id, id));
  }

  // Password reset methods
  async createPasswordResetToken(data: { userId: string; token: string; expiresAt: Date }): Promise<any> {
    const [token] = await db
      .insert(passwordResetTokens)
      .values(data)
      .returning();
    return token;
  }

  async getPasswordResetToken(token: string): Promise<any | undefined> {
    const [resetToken] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token));
    return resetToken;
  }

  async updateUserPassword(userId: string, passwordHash: string): Promise<void> {
    await db
      .update(users)
      .set({ password: passwordHash })
      .where(eq(users.id, userId));
  }

  async markPasswordResetTokenUsed(tokenId: string): Promise<void> {
    await db
      .update(passwordResetTokens)
      .set({ used: true })
      .where(eq(passwordResetTokens.id, tokenId));
  }
}

export const storage = new DatabaseStorage();
