import { 
  customers, 
  jobs, 
  users, 
  staff,
  staffShifts,
  machineScheduleBlocks,
  jobSchedule,
  jobLineItems,
  productionEntries,
  staffMachineAllocations,
  staffHolidays,
  bankHolidays,
  userStars,
  logoSetups,
  customerUsers,
  jobMessages,
  jobFiles,
  passwordResetTokens,
  customerInviteTokens,
  loginCodes,
  type LoginCode,
  impersonationSessions,
  jobErrors,
  customerDocuments,
  conversations,
  conversationMessages,
  messageReminders,
  samples,
  sampleFiles,
  machines,
  appSettings,
  threadColours,
  type ThreadColour,
  type InsertThreadColour,
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
  type ProductionEntry,
  type InsertProductionEntry,
  type StaffMachineAllocation,
  type InsertStaffMachineAllocation,
  type StaffHoliday,
  type InsertStaffHoliday,
  type BankHoliday,
  type InsertBankHoliday,
  type LogoSetup,
  type InsertLogoSetup,
  type CustomerUser,
  type JobMessage,
  type InsertJobMessage,
  type JobFile,
  type InsertJobFile,
  type JobError,
  type InsertJobError,
  type CustomerDocument,
  type InsertCustomerDocument,
  type Conversation,
  type InsertConversation,
  type ConversationMessage,
  type InsertConversationMessage,
  type Sample,
  type InsertSample,
  type SampleFile,
  type InsertSampleFile,
  type Machine,
  type InsertMachine,
  type MessageReminder,
  type InsertMessageReminder,
  tasks,
  type Task,
  type InsertTask,
  casualStaff,
  casualStaffInviteTokens,
  shifts,
  type CasualStaff,
  type InsertCasualStaff,
  type CasualStaffInviteToken,
  type Shift,
  type InsertShift,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, gte, lte, sql, isNull, isNotNull, desc, inArray } from "drizzle-orm";
import { MACHINE_HEADS } from "@shared/machines";
import { createHash } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  createUser(user: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserRole(id: string, role: string): Promise<User>;
  updateUser(id: string, updates: { username?: string; email?: string; firstName?: string; lastName?: string; emailNotificationsMessages?: boolean }): Promise<User>;
  updateUserProfileImage(id: string, profileImageUrl: string): Promise<void>;
  updateCustomerUserProfileImage(id: string, profileImageUrl: string): Promise<void>;
  updateUserActive(id: string, active: boolean): Promise<void>;
  updateUserUsername(id: string, username: string): Promise<void>;
  ensureUsernameColumn(): Promise<void>;
  getCustomers(): Promise<Customer[]>;
  getCustomer(id: string): Promise<Customer | undefined>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomer(id: string, customer: Partial<Customer>): Promise<Customer>;
  deleteCustomer(id: string): Promise<void>;
  getStaff(): Promise<Staff[]>;
  getStaffByUserId(userId: string): Promise<Staff | undefined>;
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
  getOldInvoicedJobsSummary(before: Date): Promise<{ count: number; totalValue: number }>;
  deleteOldInvoicedJobs(before: Date): Promise<number>;
  
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
  getJobLineItem(id: string): Promise<JobLineItem | null>;
  createJobLineItem(lineItem: InsertJobLineItem): Promise<JobLineItem>;
  updateJobLineItem(id: string, lineItem: Partial<JobLineItem>): Promise<JobLineItem>;
  deleteJobLineItem(id: string): Promise<void>;
  
  // Production entries (partial completion tracking)
  getProductionEntries(lineItemId?: string, staffId?: string, startDate?: Date, endDate?: Date): Promise<ProductionEntry[]>;
  getProductionEntriesByLineItem(lineItemId: string): Promise<ProductionEntry[]>;
  createProductionEntry(entry: InsertProductionEntry): Promise<ProductionEntry>;
  deleteProductionEntry(id: string): Promise<void>;
  getLineItemProgress(lineItemId: string): Promise<{ totalQuantityCompleted: number; totalMinutes: number }>;
  
  getStaffMachineAllocations(staffId?: string, machineId?: number, startDate?: Date, endDate?: Date): Promise<StaffMachineAllocation[]>;
  createStaffMachineAllocation(allocation: InsertStaffMachineAllocation): Promise<StaffMachineAllocation>;
  updateStaffMachineAllocation(id: string, allocation: Partial<StaffMachineAllocation>): Promise<StaffMachineAllocation>;
  deleteStaffMachineAllocation(id: string): Promise<void>;
  
  getStaffHolidays(staffId?: string, startDate?: Date, endDate?: Date): Promise<StaffHoliday[]>;
  createStaffHoliday(holiday: InsertStaffHoliday): Promise<StaffHoliday>;
  updateStaffHoliday(id: string, holiday: any): Promise<StaffHoliday>;
  deleteStaffHoliday(id: string): Promise<void>;
  
  getBankHolidays(startDate?: Date, endDate?: Date): Promise<BankHoliday[]>;
  createBankHoliday(holiday: InsertBankHoliday): Promise<BankHoliday>;
  updateBankHoliday(id: string, holiday: any): Promise<BankHoliday>;
  deleteBankHoliday(id: string): Promise<void>;
  
  awardStar(userId: string, starType: "yellow" | "red"): Promise<any>;
  getStarsLeaderboard(): Promise<any[]>;
  getStaffProductionMetrics(staffId?: string): Promise<any[]>;
  
  getLogoSetups(): Promise<LogoSetup[]>;
  getCompletedLogoSetups(): Promise<LogoSetup[]>;
  createLogoSetup(logoSetup: InsertLogoSetup): Promise<LogoSetup>;
  updateLogoSetup(id: string, logoSetup: Partial<LogoSetup>): Promise<LogoSetup>;
  deleteLogoSetup(id: string): Promise<void>;
  
  // Customer portal methods
  createCustomerUser(customerUser: Omit<CustomerUser, 'id' | 'createdAt' | 'lastLoginAt'> & { mustResetPassword?: boolean; active?: boolean }): Promise<CustomerUser>;
  getCustomerUserById(id: string): Promise<CustomerUser | undefined>;
  getCustomerUserByEmail(email: string): Promise<CustomerUser | undefined>;
  getCustomerUsersByCustomerId(customerId: string): Promise<CustomerUser[]>;
  getAllCustomerUsers(): Promise<CustomerUser[]>;
  updateCustomerLastLogin(id: string): Promise<void>;
  updateCustomerPassword(id: string, passwordHash: string): Promise<void>;
  updateCustomerActive(id: string, active: boolean): Promise<void>;
  deleteCustomerUser(id: string): Promise<void>;
  updateCustomerMustResetPassword(id: string, mustResetPassword: boolean): Promise<void>;
  updateCustomerUserDetails(id: string, data: { email?: string; firstName?: string; lastName?: string }): Promise<CustomerUser>;
  updateCustomerNotificationSettings(id: string, settings: { emailNotificationsMessages?: boolean; emailNotificationsDispatch?: boolean }): Promise<void>;
  updateCustomerUserInviteSent(id: string): Promise<void>;
  getJobMessages(jobId: string): Promise<JobMessage[]>;
  searchCustomerJobMessages(customerId: string, query: string): Promise<Array<{ id: string; jobId: string; jobName: string; jobNumber: number | null; isArchived: boolean; message: string; senderType: string; createdAt: Date }>>;
  createJobMessage(message: InsertJobMessage): Promise<JobMessage>;
  deleteJobMessage(messageId: string): Promise<void>;
  deleteConversationMessage(messageId: string): Promise<void>;
  updateJobMessage(messageId: string, content: string): Promise<void>;
  toggleJobMessageThumbsUp(messageId: string, userId: string): Promise<void>;
  markMessagesAsRead(jobId: string, readerType: 'staff' | 'customer'): Promise<void>;
  getConversationsForCustomer(customerId: string): Promise<any[]>;
  getUnreadCountForCustomer(customerId: string): Promise<number>;
  getAllConversationsForStaff(includeArchived?: boolean): Promise<any[]>;
  getUnreadCountForStaff(): Promise<number>;
  getJobFiles(jobId: string): Promise<JobFile[]>;
  createJobFile(file: InsertJobFile): Promise<JobFile>;
  deleteJobFile(id: string): Promise<void>;
  
  // Password reset methods
  createCustomerInviteToken(data: { customerUserId: string; token: string; expiresAt: Date }): Promise<any>;
  getCustomerInviteToken(token: string): Promise<any | undefined>;
  markCustomerInviteTokenUsed(id: string): Promise<void>;
  createPasswordResetToken(data: { userId: string; token: string; expiresAt: Date }): Promise<any>;
  getPasswordResetToken(token: string): Promise<any | undefined>;
  updateUserPassword(userId: string, passwordHash: string): Promise<void>;
  markPasswordResetTokenUsed(tokenId: string): Promise<void>;

  // Email one-time login codes (passwordless sign-in)
  createLoginCode(data: { email: string; codeHash: string; userType: string; expiresAt: Date }): Promise<LoginCode>;
  getActiveLoginCode(email: string, userType: string): Promise<LoginCode | undefined>;
  incrementLoginCodeAttempts(id: string): Promise<void>;
  consumeLoginCode(id: string): Promise<void>;
  invalidateLoginCodes(email: string, userType: string): Promise<void>;
  
  
  // Weekly Performance Report
  getWeeklyPerformance(params: { weeks?: number; endDate?: Date; timezone?: string }): Promise<Array<{
    weekStart: string;
    weekEnd: string;
    invoicedTotal: number;
    completedQuantity: number;
    newCustomers: number;
    totalActiveCustomers: number;
  }>>;

  getKeyMetricsWeekly(params: { weeks?: number; endDate?: Date; timezone?: string }): Promise<{
    weekly: Array<{
      weekStart: string;
      weekEnd: string;
      activeCustomers: number;
      invoicedJobs: number;
      jobValue: number;
      avgJobValue: number;
      avgJobQuantity: number;
      onTimeCount: number;
      lateOrders: number;
      onTimePercentage: number;
      totalErrors: number;
      outputQuantity: number;
    }>;
    rolling: {
      weeks: number;
      activeCustomers: number;
      invoicedJobs: number;
      jobValue: number;
      avgJobValue: number;
      avgJobQuantity: number;
      onTimeCount: number;
      lateOrders: number;
      onTimePercentage: number;
      totalErrors: number;
      outputQuantity: number;
    };
  }>;

  getAllCustomersWeeklyTrend(params: { weeks?: number; endDate?: Date; timezone?: string; topN?: number }): Promise<{
    weeks: Array<{ weekStart: string; weekEnd: string }>;
    customers: Array<{
      customerId: string;
      customerName: string;
      totalInvoiced: number;
      weekly: Array<{ weekStart: string; invoicedTotal: number }>;
    }>;
  }>;
  getCustomerWeeklyTrend(params: { customerId: string; weeks?: number; endDate?: Date; timezone?: string }): Promise<Array<{
    weekStart: string;
    weekEnd: string;
    invoicedTotal: number;
    completedQuantity: number;
  }>>;

  // Production Time Analysis
  getProductionTimeAnalysis(params: { weeks?: number; endDate?: Date }): Promise<Array<{
    staffName: string;
    machineName: string;
    totalEstimatedMinutes: number;
    totalActualMinutes: number;
    completedItems: number;
    averageAccuracy: number | null;
  }>>;
  
  // Customer impersonation methods
  createImpersonationSession(data: { token: string; staffUserId: string; customerUserId: string; expiresAt: Date }): Promise<any>;
  getImpersonationSession(token: string): Promise<any | undefined>;
  invalidateImpersonationSession(token: string): Promise<void>;
  
  // Job error tracking methods
  getJobErrors(jobId: string): Promise<JobError[]>;
  getJobError(id: string): Promise<JobError | undefined>;
  createJobError(error: InsertJobError): Promise<JobError>;
  updateJobError(id: string, error: Partial<JobError>): Promise<JobError>;
  deleteJobError(id: string): Promise<void>;
  getUnresolvedJobErrors(): Promise<JobError[]>;
  getAllJobErrors(): Promise<JobError[]>;
  
  // Customer documents methods
  getCustomerDocuments(): Promise<CustomerDocument[]>;
  getActiveCustomerDocuments(): Promise<CustomerDocument[]>;
  getCustomerDocument(id: string): Promise<CustomerDocument | undefined>;
  createCustomerDocument(doc: InsertCustomerDocument): Promise<CustomerDocument>;
  updateCustomerDocument(id: string, doc: Partial<CustomerDocument>): Promise<CustomerDocument>;
  deleteCustomerDocument(id: string): Promise<void>;

  // Direct conversations
  getConversations(): Promise<Conversation[]>;
  getConversationsByCustomer(customerId: string): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation | undefined>;
  createConversation(data: InsertConversation): Promise<Conversation>;
  updateConversation(id: string, data: Partial<Conversation>): Promise<Conversation>;
  getConversationMessages(conversationId: string): Promise<ConversationMessage[]>;
  createConversationMessage(data: InsertConversationMessage): Promise<ConversationMessage>;
  markConversationMessagesReadByStaff(conversationId: string): Promise<void>;
  markConversationMessagesReadByCustomer(conversationId: string): Promise<void>;
  getUnreadConversationCountForStaff(): Promise<number>;
  getUnreadConversationCountForCustomer(customerId: string): Promise<number>;

  // Samples
  getSamples(): Promise<Sample[]>;
  getSamplesByCustomer(customerId: string): Promise<Sample[]>;
  getSample(id: string): Promise<Sample | undefined>;
  createSample(data: InsertSample): Promise<Sample>;
  updateSample(id: string, data: Partial<Sample>): Promise<Sample>;
  deleteSample(id: string): Promise<void>;
  getSampleFiles(sampleId: string): Promise<SampleFile[]>;
  createSampleFile(data: InsertSampleFile): Promise<SampleFile>;
  deleteSampleFile(id: string): Promise<void>;

  // Machine management
  getMachines(): Promise<Machine[]>;
  getMachine(id: number): Promise<Machine | undefined>;
  updateMachine(id: number, data: Partial<Machine>): Promise<Machine>;
  seedMachines(): Promise<void>;
  ensurePrintMachine(): Promise<void>;

  // App settings (key/value)
  getAppSetting(key: string): Promise<string | null>;
  setAppSetting(key: string, value: string): Promise<void>;

  // Message mark-as-unread
  markJobMessageUnread(messageId: string, field: 'readByStaff' | 'readByCustomer'): Promise<void>;
  markConversationMessageUnread(messageId: string, field: 'readByStaff' | 'readByCustomer'): Promise<void>;

  // Message reminders
  createMessageReminder(data: InsertMessageReminder): Promise<MessageReminder>;
  getMessageReminders(userId: string, userType: string): Promise<MessageReminder[]>;
  dismissMessageReminder(id: string): Promise<void>;
  deleteMessageReminder(id: string): Promise<void>;

  // Tasks
  getTasks(filters?: { assignedToUserId?: string; status?: string }): Promise<Task[]>;
  getTask(id: number): Promise<Task | undefined>;
  createTask(data: InsertTask): Promise<Task>;
  updateTask(id: number, data: Partial<InsertTask & { completedAt: Date | null }>): Promise<Task>;
  deleteTask(id: number): Promise<void>;
  getOpenTaskCount(): Promise<number>;

  // Thread Colour Library
  getThreadColours(): Promise<ThreadColour[]>;
  upsertThreadColours(colours: InsertThreadColour[]): Promise<void>;
  clearThreadColours(): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(sql`lower(${users.email}) = lower(${email})`);
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(sql`lower(${users.username}) = lower(${username})`);
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

  async updateUserActive(id: string, active: boolean): Promise<void> {
    await db
      .update(users)
      .set({ active, updatedAt: new Date() })
      .where(eq(users.id, id));
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

  async getCustomer(id: string): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
    return customer;
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

  async getStaffByUserId(userId: string): Promise<Staff | undefined> {
    const [staffMember] = await db.select().from(staff).where(eq(staff.userId, userId));
    return staffMember;
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
    await db.transaction(async (tx) => {
      // Clear all nullable FK references to this staff member
      await tx.update(jobs).set({ completedById: null }).where(eq(jobs.completedById, id));
      await tx.update(jobLineItems).set({ completedById: null }).where(eq(jobLineItems.completedById, id));
      await tx.update(jobErrors).set({ assignedToId: null }).where(eq(jobErrors.assignedToId, id));

      // Delete non-nullable, non-cascade dependent records
      await tx.delete(jobSchedule).where(eq(jobSchedule.staffId, id));
      await tx.delete(productionEntries).where(eq(productionEntries.staffId, id));

      await tx.delete(staff).where(eq(staff.id, id));
    });
  }

  async getJob(id: string): Promise<Job | undefined> {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
    return job;
  }

  async getJobs(): Promise<Job[]> {
    return await db.select().from(jobs);
  }

  async getJobsByMachine(machineId: number): Promise<Job[]> {
    // Machine assignments live on line items, not the top-level job.
    // Return all jobs that have at least one line item assigned to this machine.
    const lineItemRows = await db
      .selectDistinct({ jobId: jobLineItems.jobId })
      .from(jobLineItems)
      .where(eq(jobLineItems.machineId, machineId));
    const jobIds = lineItemRows.map(r => r.jobId);
    if (jobIds.length === 0) return [];
    return await db.select().from(jobs).where(inArray(jobs.id, jobIds));
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

  private oldInvoicedCondition(before: Date) {
    return and(
      eq(jobs.completed, true),
      eq(jobs.invoiceStatus, "invoiced"),
      isNotNull(jobs.invoicedAt),
      lte(jobs.invoicedAt, before),
    );
  }

  async getOldInvoicedJobsSummary(before: Date): Promise<{ count: number; totalValue: number }> {
    const rows = await db
      .select({
        count: sql<number>`count(*)::int`,
        totalValue: sql<number>`coalesce(sum(${jobs.invoiceTotal}), 0)`,
      })
      .from(jobs)
      .where(this.oldInvoicedCondition(before));
    return {
      count: Number(rows[0]?.count ?? 0),
      totalValue: Number(rows[0]?.totalValue ?? 0),
    };
  }

  async deleteOldInvoicedJobs(before: Date): Promise<number> {
    const matching = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(this.oldInvoicedCondition(before));
    const ids = matching.map(r => r.id);
    if (ids.length === 0) return 0;
    // job_messages.jobId is set-null on delete, so explicitly remove the chat
    // history for these jobs rather than leaving orphaned messages behind.
    await db.delete(jobMessages).where(inArray(jobMessages.jobId, ids));
    const deleted = await db
      .delete(jobs)
      .where(inArray(jobs.id, ids))
      .returning({ id: jobs.id });
    return deleted.length;
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

  async getJobLineItem(id: string): Promise<JobLineItem | null> {
    const [lineItem] = await db.select().from(jobLineItems).where(eq(jobLineItems.id, id));
    return lineItem || null;
  }

  async createJobLineItem(insertLineItem: InsertJobLineItem): Promise<JobLineItem> {
    const [lineItem] = await db
      .insert(jobLineItems)
      .values({
        ...insertLineItem,
        completedAt: insertLineItem.completedAt ? new Date(insertLineItem.completedAt) : null,
        logoApprovedAt: insertLineItem.logoApproved ? new Date() : null,
      })
      .returning();
    return lineItem;
  }

  async updateJobLineItem(id: string, updates: Partial<JobLineItem>): Promise<JobLineItem> {
    // Handle date conversion for completedAt if it's a string
    const processedUpdates: Partial<JobLineItem> = {
      ...updates,
      ...(updates.completedAt && typeof updates.completedAt === 'string' 
        ? { completedAt: new Date(updates.completedAt) } 
        : {}),
    };

    // Auto-manage the logo-approval timestamp so we can measure when a job
    // genuinely joined the production queue. Stamp the moment the logo is
    // approved (if not already stamped); clear it if the approval is removed.
    if (updates.logoApproved !== undefined && updates.logoApprovedAt === undefined) {
      if (updates.logoApproved === true) {
        const [existing] = await db
          .select({ logoApprovedAt: jobLineItems.logoApprovedAt })
          .from(jobLineItems)
          .where(eq(jobLineItems.id, id));
        if (!existing?.logoApprovedAt) {
          processedUpdates.logoApprovedAt = new Date();
        }
      } else {
        processedUpdates.logoApprovedAt = null;
      }
    }
    
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

  // Production entries (partial completion tracking)
  async getProductionEntries(lineItemId?: string, staffId?: string, startDate?: Date, endDate?: Date): Promise<ProductionEntry[]> {
    const conditions = [];
    if (lineItemId) {
      conditions.push(eq(productionEntries.lineItemId, lineItemId));
    }
    if (staffId) {
      conditions.push(eq(productionEntries.staffId, staffId));
    }
    if (startDate) {
      conditions.push(gte(productionEntries.workDate, startDate));
    }
    if (endDate) {
      conditions.push(lte(productionEntries.workDate, endDate));
    }
    
    if (conditions.length === 0) {
      return db.select().from(productionEntries).orderBy(productionEntries.workDate);
    }
    return db.select().from(productionEntries).where(and(...conditions)).orderBy(productionEntries.workDate);
  }

  async getProductionEntriesByLineItem(lineItemId: string): Promise<ProductionEntry[]> {
    return db.select().from(productionEntries).where(eq(productionEntries.lineItemId, lineItemId)).orderBy(productionEntries.workDate);
  }

  async createProductionEntry(entry: InsertProductionEntry): Promise<ProductionEntry> {
    const [created] = await db.insert(productionEntries).values({
      ...entry,
      workDate: new Date(entry.workDate),
    }).returning();
    return created;
  }

  async deleteProductionEntry(id: string): Promise<void> {
    await db.delete(productionEntries).where(eq(productionEntries.id, id));
  }

  async getLineItemProgress(lineItemId: string): Promise<{ totalQuantityCompleted: number; totalMinutes: number }> {
    const result = await db.execute(sql`
      SELECT 
        COALESCE(SUM(quantity_completed), 0) as total_quantity,
        COALESCE(SUM(production_time_minutes), 0) as total_minutes
      FROM production_entries
      WHERE line_item_id = ${lineItemId}
    `);
    const row = (result.rows as any[])[0];
    return {
      totalQuantityCompleted: parseInt(row?.total_quantity) || 0,
      totalMinutes: parseInt(row?.total_minutes) || 0,
    };
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

  // Staff holidays methods
  async getStaffHolidays(staffId?: string, startDate?: Date, endDate?: Date): Promise<StaffHoliday[]> {
    const conditions = [];
    if (staffId) {
      conditions.push(eq(staffHolidays.staffId, staffId));
    }
    
    // Include holidays that overlap with the query range:
    // Holiday overlaps if: (holiday.endDate >= startDate) AND (holiday.startDate <= endDate)
    if (startDate && endDate) {
      conditions.push(
        and(
          gte(staffHolidays.endDate, startDate),   // Holiday ends on or after range start
          lte(staffHolidays.startDate, endDate)     // Holiday starts on or before range end
        )
      );
    } else if (startDate) {
      conditions.push(gte(staffHolidays.endDate, startDate)); // Holiday ends on or after date
    } else if (endDate) {
      conditions.push(lte(staffHolidays.startDate, endDate)); // Holiday starts on or before date
    }
    
    if (conditions.length === 0) {
      return await db.select().from(staffHolidays);
    }
    
    // Use and() only if we have multiple conditions
    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];
    return await db.select().from(staffHolidays).where(whereClause);
  }

  async createStaffHoliday(insertHoliday: InsertStaffHoliday): Promise<StaffHoliday> {
    const [holiday] = await db
      .insert(staffHolidays)
      .values({
        ...insertHoliday,
        startDate: new Date(insertHoliday.startDate),
        endDate: new Date(insertHoliday.endDate),
      })
      .returning();
    return holiday;
  }

  async updateStaffHoliday(id: string, updates: any): Promise<StaffHoliday> {
    // Whitelist only allowed fields and convert dates
    const processedUpdates: any = {};
    
    if (updates.staffId !== undefined) processedUpdates.staffId = updates.staffId;
    if (updates.holidayType !== undefined) processedUpdates.holidayType = updates.holidayType;
    if (updates.notes !== undefined) processedUpdates.notes = updates.notes;
    if (updates.status !== undefined) processedUpdates.status = updates.status;
    if (updates.halfDayStart !== undefined) processedUpdates.halfDayStart = updates.halfDayStart;
    if (updates.halfDayEnd !== undefined) processedUpdates.halfDayEnd = updates.halfDayEnd;
    if (updates.reviewNotes !== undefined) processedUpdates.reviewNotes = updates.reviewNotes;
    if (updates.reviewedById !== undefined) processedUpdates.reviewedById = updates.reviewedById;
    if (updates.reviewedAt !== undefined) {
      processedUpdates.reviewedAt = updates.reviewedAt === null
        ? null
        : (typeof updates.reviewedAt === 'string' ? new Date(updates.reviewedAt) : updates.reviewedAt);
    }
    
    if (updates.startDate) {
      const dateValue = typeof updates.startDate === 'string' ? new Date(updates.startDate) : updates.startDate;
      if (isNaN(dateValue.getTime())) throw new Error("Invalid startDate");
      processedUpdates.startDate = dateValue;
    }
    
    if (updates.endDate) {
      const dateValue = typeof updates.endDate === 'string' ? new Date(updates.endDate) : updates.endDate;
      if (isNaN(dateValue.getTime())) throw new Error("Invalid endDate");
      processedUpdates.endDate = dateValue;
    }
    
    const [holiday] = await db
      .update(staffHolidays)
      .set(processedUpdates)
      .where(eq(staffHolidays.id, id))
      .returning();
    if (!holiday) throw new Error("Staff holiday not found");
    return holiday;
  }

  async deleteStaffHoliday(id: string): Promise<void> {
    await db.delete(staffHolidays).where(eq(staffHolidays.id, id));
  }

  // Bank holidays methods
  async getBankHolidays(startDate?: Date, endDate?: Date): Promise<BankHoliday[]> {
    const conditions = [];
    // Bank holidays are single dates, so simple range check is sufficient
    if (startDate) {
      conditions.push(gte(bankHolidays.date, startDate));
    }
    if (endDate) {
      conditions.push(lte(bankHolidays.date, endDate));
    }
    
    if (conditions.length === 0) {
      return await db.select().from(bankHolidays).orderBy(bankHolidays.date);
    }
    
    // Use and() only if we have multiple conditions
    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];
    return await db.select().from(bankHolidays).where(whereClause).orderBy(bankHolidays.date);
  }

  async createBankHoliday(insertHoliday: InsertBankHoliday): Promise<BankHoliday> {
    const [holiday] = await db
      .insert(bankHolidays)
      .values({
        ...insertHoliday,
        date: new Date(insertHoliday.date),
      })
      .returning();
    return holiday;
  }

  async updateBankHoliday(id: string, updates: any): Promise<BankHoliday> {
    // Whitelist only allowed fields and convert date
    const processedUpdates: any = {};
    
    if (updates.name !== undefined) processedUpdates.name = updates.name;
    if (updates.description !== undefined) processedUpdates.description = updates.description;
    
    if (updates.date) {
      const dateValue = typeof updates.date === 'string' ? new Date(updates.date) : updates.date;
      if (isNaN(dateValue.getTime())) throw new Error("Invalid date");
      processedUpdates.date = dateValue;
    }
    
    const [holiday] = await db
      .update(bankHolidays)
      .set(processedUpdates)
      .where(eq(bankHolidays.id, id))
      .returning();
    if (!holiday) throw new Error("Bank holiday not found");
    return holiday;
  }

  async deleteBankHoliday(id: string): Promise<void> {
    await db.delete(bankHolidays).where(eq(bankHolidays.id, id));
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
    return await db.select().from(logoSetups).where(isNull(logoSetups.invoicedAt));
  }

  async getCompletedLogoSetups(): Promise<LogoSetup[]> {
    return await db.select().from(logoSetups).where(isNotNull(logoSetups.invoicedAt))
      .orderBy(desc(logoSetups.invoicedAt));
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
    // Case-insensitive email lookup
    const normalizedEmail = email.toLowerCase().trim();
    const [user] = await db.select().from(customerUsers).where(
      sql`LOWER(${customerUsers.email}) = ${normalizedEmail}`
    );
    return user;
  }

  async getCustomerUsersByCustomerId(customerId: string): Promise<CustomerUser[]> {
    return await db.select().from(customerUsers).where(eq(customerUsers.customerId, customerId));
  }

  async getAllCustomerUsers(): Promise<CustomerUser[]> {
    return await db.select().from(customerUsers);
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

  async deleteCustomerUser(id: string): Promise<void> {
    await db.delete(customerUsers).where(eq(customerUsers.id, id));
  }

  async updateUserProfileImage(id: string, profileImageUrl: string): Promise<void> {
    await db
      .update(users)
      .set({ profileImageUrl })
      .where(eq(users.id, id));
  }

  async updateCustomerUserProfileImage(id: string, profileImageUrl: string): Promise<void> {
    await db
      .update(customerUsers)
      .set({ profileImageUrl })
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

  async updateCustomerUserDetails(id: string, data: { email?: string; firstName?: string; lastName?: string }): Promise<CustomerUser> {
    const [updated] = await db
      .update(customerUsers)
      .set(data)
      .where(eq(customerUsers.id, id))
      .returning();
    return updated;
  }

  async updateCustomerNotificationSettings(id: string, settings: { emailNotificationsMessages?: boolean; emailNotificationsDispatch?: boolean }): Promise<void> {
    const updates: Record<string, boolean> = {};
    if (typeof settings.emailNotificationsMessages === "boolean") updates.emailNotificationsMessages = settings.emailNotificationsMessages;
    if (typeof settings.emailNotificationsDispatch === "boolean") updates.emailNotificationsDispatch = settings.emailNotificationsDispatch;
    if (!Object.keys(updates).length) return;
    await db
      .update(customerUsers)
      .set(updates)
      .where(eq(customerUsers.id, id));
  }

  async updateCustomerUserInviteSent(id: string): Promise<void> {
    await db
      .update(customerUsers)
      .set({ inviteSentAt: new Date() })
      .where(eq(customerUsers.id, id));
  }

  async getJobMessages(jobId: string): Promise<JobMessage[]> {
    return await db.select().from(jobMessages).where(eq(jobMessages.jobId, jobId)).orderBy(jobMessages.createdAt);
  }

  async searchCustomerJobMessages(customerId: string, query: string): Promise<Array<{ id: string; jobId: string; jobName: string; jobNumber: number | null; isArchived: boolean; message: string; senderType: string; createdAt: Date }>> {
    const q = (query || "").trim();
    if (!q) return [];
    const rows = await db
      .select({
        id: jobMessages.id,
        jobId: jobMessages.jobId,
        jobName: jobs.jobName,
        jobNumber: jobs.jobNumber,
        isArchived: jobs.conversationArchivedByStaff,
        message: jobMessages.message,
        senderType: jobMessages.senderType,
        createdAt: jobMessages.createdAt,
      })
      .from(jobMessages)
      .innerJoin(jobs, eq(jobMessages.jobId, jobs.id))
      .where(and(
        eq(jobs.customerId, customerId),
        eq(jobMessages.deleted, false),
        sql`${jobMessages.message} ILIKE ${'%' + q + '%'}`,
      ))
      .orderBy(desc(jobMessages.createdAt))
      .limit(50);
    return rows.map(r => ({
      id: r.id,
      jobId: r.jobId!,
      jobName: r.jobName || "",
      jobNumber: r.jobNumber ?? null,
      isArchived: !!r.isArchived,
      message: r.message || "",
      senderType: r.senderType,
      createdAt: r.createdAt,
    }));
  }

  async createJobMessage(message: InsertJobMessage): Promise<JobMessage> {
    const [newMessage] = await db
      .insert(jobMessages)
      .values(message)
      .returning();
    return newMessage;
  }

  async deleteJobMessage(messageId: string): Promise<void> {
    await db.update(jobMessages).set({ deleted: true, message: "" }).where(eq(jobMessages.id, messageId));
  }

  async deleteConversationMessage(messageId: string): Promise<void> {
    await db.delete(conversationMessages).where(eq(conversationMessages.id, messageId));
  }

  async updateJobMessage(messageId: string, content: string): Promise<void> {
    await db.update(jobMessages).set({ message: content, editedAt: new Date() }).where(eq(jobMessages.id, messageId));
  }

  async toggleJobMessageThumbsUp(messageId: string, userId: string): Promise<void> {
    const [msg] = await db.select({ thumbsUpBy: jobMessages.thumbsUpBy }).from(jobMessages).where(eq(jobMessages.id, messageId));
    if (!msg) return;
    const current = msg.thumbsUpBy || [];
    const updated = current.includes(userId) ? current.filter(id => id !== userId) : [...current, userId];
    await db.update(jobMessages).set({ thumbsUpBy: updated }).where(eq(jobMessages.id, messageId));
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

  async getConversationsForCustomer(customerId: string, includeArchived = false): Promise<any[]> {
    // Get all jobs for this customer (excluding archived unless requested)
    const customerJobs = await db.select().from(jobs).where(
      includeArchived
        ? eq(jobs.customerId, customerId)
        : and(eq(jobs.customerId, customerId), eq(jobs.conversationArchivedByCustomer, false))
    );
    const jobIds = customerJobs.map(j => j.id);
    if (jobIds.length === 0) return [];

    const allMessages = await db
      .select()
      .from(jobMessages)
      .where(inArray(jobMessages.jobId, jobIds))
      .orderBy(jobMessages.createdAt);

    // Group by jobId
    const byJob = new Map<string, typeof allMessages>();
    for (const msg of allMessages) {
      if (!msg.jobId) continue;
      if (!byJob.has(msg.jobId)) byJob.set(msg.jobId, []);
      byJob.get(msg.jobId)!.push(msg);
    }

    const result = [];
    for (const job of customerJobs) {
      const msgs = byJob.get(job.id) || [];
      const unread = msgs.filter(m => m.senderType === 'staff' && !m.readByCustomer).length;
      const latest = msgs.length > 0 ? msgs[msgs.length - 1] : null;
      result.push({
        jobId: job.id,
        jobName: job.jobName,
        status: job.status,
        completed: job.completed,
        messageCount: msgs.length,
        unreadCount: unread,
        isArchived: !!job.conversationArchivedByCustomer,
        latestMessage: latest ? { message: latest.message, senderType: latest.senderType, createdAt: latest.createdAt } : null,
      });
    }

    // Sort by latest message desc, then by job name
    result.sort((a, b) => {
      if (a.latestMessage && b.latestMessage) {
        return new Date(b.latestMessage.createdAt).getTime() - new Date(a.latestMessage.createdAt).getTime();
      }
      if (a.latestMessage) return -1;
      if (b.latestMessage) return 1;
      return a.jobName.localeCompare(b.jobName);
    });

    return result;
  }

  async getUnreadCountForCustomer(customerId: string): Promise<number> {
    const customerJobs = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.customerId, customerId));
    const jobIds = customerJobs.map(j => j.id);
    if (jobIds.length === 0) return 0;

    const unread = await db
      .select()
      .from(jobMessages)
      .where(
        and(
          inArray(jobMessages.jobId, jobIds),
          eq(jobMessages.senderType, 'staff'),
          eq(jobMessages.readByCustomer, false)
        )
      );
    return unread.length;
  }

  async getAllConversationsForStaff(includeArchived = false): Promise<any[]> {
    // Get all messages that are still linked to a job (jobId not null = job not deleted)
    const allMsgs = await db.select().from(jobMessages)
      .where(isNotNull(jobMessages.jobId))
      .orderBy(jobMessages.createdAt);
    if (allMsgs.length === 0) return [];

    const jobIdSet = new Set(allMsgs.map(m => m.jobId).filter(Boolean) as string[]);
    const jobIdArr = Array.from(jobIdSet);
    const allJobs = await db.select().from(jobs).where(inArray(jobs.id, jobIdArr));
    const allCustomers = await db.select().from(customers);
    const customerMap = new Map(allCustomers.map(c => [c.id, c]));

    const byJob = new Map<string, typeof allMsgs>();
    for (const msg of allMsgs) {
      if (!msg.jobId) continue;
      if (!byJob.has(msg.jobId)) byJob.set(msg.jobId, []);
      byJob.get(msg.jobId)!.push(msg);
    }

    const result = [];
    for (const job of allJobs) {
      if (!includeArchived && job.conversationArchivedByStaff) continue;
      const msgs = byJob.get(job.id) || [];
      // Exclude soft-deleted messages from unread count and latest message preview
      const activeMsgs = msgs.filter(m => !m.deleted);
      const unread = activeMsgs.filter(m => m.senderType === 'customer' && !m.readByStaff).length;
      const latest = activeMsgs.length > 0 ? activeMsgs[activeMsgs.length - 1] : null;
      const customer = customerMap.get(job.customerId);
      result.push({
        jobId: job.id,
        jobName: job.jobName,
        customerId: job.customerId,
        customerName: customer?.name || 'Unknown',
        customerLogoUrl: customer?.logoUrl || null,
        status: job.status,
        completed: job.completed,
        messageCount: activeMsgs.length,
        unreadCount: unread,
        isArchivedByStaff: !!job.conversationArchivedByStaff,
        latestMessage: latest ? { message: latest.message, senderType: latest.senderType, createdAt: latest.createdAt } : null,
      });
    }

    result.sort((a, b) => {
      if (a.latestMessage && b.latestMessage) {
        return new Date(b.latestMessage.createdAt).getTime() - new Date(a.latestMessage.createdAt).getTime();
      }
      if (a.latestMessage) return -1;
      if (b.latestMessage) return 1;
      return 0;
    });

    return result;
  }

  async getUnreadCountForStaff(): Promise<number> {
    // Count unread customer job messages — excluding archived conversations
    const unreadJobMsgs = await db
      .select({ id: jobMessages.id })
      .from(jobMessages)
      .innerJoin(jobs, eq(jobMessages.jobId, jobs.id))
      .where(
        and(
          eq(jobMessages.senderType, 'customer'),
          eq(jobMessages.readByStaff, false),
          eq(jobs.conversationArchivedByStaff, false)
        )
      );

    // Count unread staff direct-conversation messages — excluding staff-archived conversations
    const unreadDirectMsgs = await db
      .select({ id: conversationMessages.id })
      .from(conversationMessages)
      .innerJoin(conversations, eq(conversationMessages.conversationId, conversations.id))
      .where(
        and(
          eq(conversationMessages.senderType, 'customer'),
          eq(conversationMessages.readByStaff, false),
          eq(conversations.archivedByStaff, false)
        )
      );

    return unreadJobMsgs.length + unreadDirectMsgs.length;
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

  // Email one-time login codes (passwordless sign-in)
  async createLoginCode(data: { email: string; codeHash: string; userType: string; expiresAt: Date }): Promise<LoginCode> {
    const [code] = await db.insert(loginCodes).values(data).returning();
    return code;
  }

  async getActiveLoginCode(email: string, userType: string): Promise<LoginCode | undefined> {
    const [code] = await db
      .select()
      .from(loginCodes)
      .where(
        and(
          eq(loginCodes.email, email.toLowerCase()),
          eq(loginCodes.userType, userType),
          eq(loginCodes.consumed, false),
          gte(loginCodes.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(loginCodes.createdAt))
      .limit(1);
    return code;
  }

  async incrementLoginCodeAttempts(id: string): Promise<void> {
    await db
      .update(loginCodes)
      .set({ attempts: sql`${loginCodes.attempts} + 1` })
      .where(eq(loginCodes.id, id));
  }

  async consumeLoginCode(id: string): Promise<void> {
    await db.update(loginCodes).set({ consumed: true }).where(eq(loginCodes.id, id));
  }

  async invalidateLoginCodes(email: string, userType: string): Promise<void> {
    await db
      .update(loginCodes)
      .set({ consumed: true })
      .where(
        and(
          eq(loginCodes.email, email.toLowerCase()),
          eq(loginCodes.userType, userType),
          eq(loginCodes.consumed, false),
        ),
      );
  }

  async createCustomerInviteToken(data: { customerUserId: string; token: string; expiresAt: Date }): Promise<any> {
    const [token] = await db
      .insert(customerInviteTokens)
      .values(data)
      .returning();
    return token;
  }

  async getCustomerInviteToken(token: string): Promise<any | undefined> {
    const [row] = await db
      .select()
      .from(customerInviteTokens)
      .where(eq(customerInviteTokens.token, token));
    return row;
  }

  async markCustomerInviteTokenUsed(id: string): Promise<void> {
    await db
      .update(customerInviteTokens)
      .set({ used: true })
      .where(eq(customerInviteTokens.id, id));
  }

  async getWeeklyPerformance(params: { 
    weeks?: number; 
    endDate?: Date; 
    timezone?: string;
  }): Promise<Array<{
    weekStart: string;
    weekEnd: string;
    invoicedTotal: number;
    completedQuantity: number;
    newCustomers: number;
    totalActiveCustomers: number;
  }>> {
    const { weeks = 12, endDate = new Date(), timezone = 'Europe/London' } = params;
    
    const result = await db.execute(sql`
      WITH base_week AS (
        SELECT date_trunc('week', ${endDate}::timestamp AT TIME ZONE ${timezone}) AS week_end
      ),
      week_series AS (
        SELECT 
          date_trunc('week', 
            (SELECT week_end FROM base_week) - ((${weeks} - 1) || ' weeks')::interval + (n || ' weeks')::interval
          ) AS week_start
        FROM generate_series(0, ${weeks} - 1) AS n
      ),
      weeks_with_end AS (
        SELECT 
          week_start::date,
          (week_start + '6 days'::interval)::date AS week_end
        FROM week_series
      ),
      invoiced_by_week AS (
        SELECT 
          date_trunc('week', j.invoiced_at AT TIME ZONE ${timezone})::date AS week_start,
          SUM(j.invoice_total) AS total_invoiced
        FROM jobs j
        WHERE j.invoiced_at IS NOT NULL
          AND j.invoice_total IS NOT NULL
          AND date_trunc('week', j.invoiced_at AT TIME ZONE ${timezone}) >= 
              (SELECT week_end FROM base_week) - ((${weeks} - 1) || ' weeks')::interval
          AND date_trunc('week', j.invoiced_at AT TIME ZONE ${timezone}) <= 
              (SELECT week_end FROM base_week)
        GROUP BY 1
      ),
      completed_by_week AS (
        SELECT 
          date_trunc('week', jli.completed_at AT TIME ZONE ${timezone})::date AS week_start,
          SUM(jli.quantity) AS total_quantity
        FROM job_line_items jli
        WHERE jli.completed_at IS NOT NULL
          AND date_trunc('week', jli.completed_at AT TIME ZONE ${timezone}) >= 
              (SELECT week_end FROM base_week) - ((${weeks} - 1) || ' weeks')::interval
          AND date_trunc('week', jli.completed_at AT TIME ZONE ${timezone}) <= 
              (SELECT week_end FROM base_week)
        GROUP BY 1
      ),
      new_customers_by_week AS (
        SELECT
          date_trunc('week', c.created_at AT TIME ZONE ${timezone})::date AS week_start,
          COUNT(*) AS new_count
        FROM customers c
        WHERE c.created_at IS NOT NULL
          AND date_trunc('week', c.created_at AT TIME ZONE ${timezone}) >=
              (SELECT week_end FROM base_week) - ((${weeks} - 1) || ' weeks')::interval
          AND date_trunc('week', c.created_at AT TIME ZONE ${timezone}) <=
              (SELECT week_end FROM base_week)
        GROUP BY 1
      ),
      active_customers_by_week AS (
        SELECT
          date_trunc('week', j.invoiced_at AT TIME ZONE ${timezone})::date AS week_start,
          COUNT(DISTINCT j.customer_id) AS active_count
        FROM jobs j
        WHERE j.invoiced_at IS NOT NULL
          AND date_trunc('week', j.invoiced_at AT TIME ZONE ${timezone}) >=
              (SELECT week_end FROM base_week) - ((${weeks} - 1) || ' weeks')::interval
          AND date_trunc('week', j.invoiced_at AT TIME ZONE ${timezone}) <=
              (SELECT week_end FROM base_week)
        GROUP BY 1
      )
      SELECT
        w.week_start::text,
        w.week_end::text,
        COALESCE(ib.total_invoiced, 0) AS invoiced_total,
        COALESCE(cb.total_quantity, 0) AS completed_quantity,
        COALESCE(nc.new_count, 0) AS new_customers,
        COALESCE(ac.active_count, 0) AS total_active_customers
      FROM weeks_with_end w
      LEFT JOIN invoiced_by_week ib ON w.week_start = ib.week_start
      LEFT JOIN completed_by_week cb ON w.week_start = cb.week_start
      LEFT JOIN new_customers_by_week nc ON w.week_start = nc.week_start
      LEFT JOIN active_customers_by_week ac ON w.week_start = ac.week_start
      ORDER BY w.week_start
    `);

    return result.rows.map((row: any) => ({
      weekStart: row.week_start,
      weekEnd: row.week_end,
      invoicedTotal: parseFloat(row.invoiced_total) || 0,
      completedQuantity: parseInt(row.completed_quantity) || 0,
      newCustomers: parseInt(row.new_customers) || 0,
      totalActiveCustomers: parseInt(row.total_active_customers) || 0,
    }));
  }

  async getKeyMetricsWeekly(params: { weeks?: number; endDate?: Date; timezone?: string }): Promise<{
    weekly: Array<{
      weekStart: string;
      weekEnd: string;
      activeCustomers: number;
      invoicedJobs: number;
      jobValue: number;
      avgJobValue: number;
      avgJobQuantity: number;
      onTimeCount: number;
      lateOrders: number;
      onTimePercentage: number;
      totalErrors: number;
      outputQuantity: number;
    }>;
    rolling: {
      weeks: number;
      activeCustomers: number;
      invoicedJobs: number;
      jobValue: number;
      avgJobValue: number;
      avgJobQuantity: number;
      onTimeCount: number;
      lateOrders: number;
      onTimePercentage: number;
      totalErrors: number;
      outputQuantity: number;
    };
  }> {
    const { weeks = 16, endDate = new Date(), timezone = 'Europe/London' } = params;

    // Timestamps are stored as naive UTC; convert UTC -> local wall time before bucketing
    const result = await db.execute(sql`
      WITH base_week AS (
        SELECT date_trunc('week', ${endDate}::timestamptz AT TIME ZONE ${timezone}) AS week_end
      ),
      window_start AS (
        SELECT (SELECT week_end FROM base_week) - ((${weeks} - 1) || ' weeks')::interval AS start
      ),
      week_series AS (
        SELECT
          date_trunc('week',
            (SELECT start FROM window_start) + (n || ' weeks')::interval
          ) AS week_start
        FROM generate_series(0, ${weeks} - 1) AS n
      ),
      weeks_with_end AS (
        SELECT
          week_start::date,
          (week_start + '6 days'::interval)::date AS week_end
        FROM week_series
      ),
      invoiced_by_week AS (
        SELECT
          date_trunc('week', (j.invoiced_at AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})::date AS week_start,
          COUNT(*) AS invoiced_jobs,
          COUNT(DISTINCT j.customer_id) AS active_customers,
          SUM(COALESCE(j.invoice_total, 0)) AS job_value,
          AVG(j.quantity) AS avg_job_quantity
        FROM jobs j
        WHERE j.invoiced_at IS NOT NULL
          AND date_trunc('week', (j.invoiced_at AT TIME ZONE 'UTC') AT TIME ZONE ${timezone}) >= (SELECT start FROM window_start)
          AND date_trunc('week', (j.invoiced_at AT TIME ZONE 'UTC') AT TIME ZONE ${timezone}) <= (SELECT week_end FROM base_week)
        GROUP BY 1
      ),
      delivery_by_week AS (
        SELECT
          date_trunc('week', (jli.completed_at AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})::date AS week_start,
          SUM(COALESCE(jli.quantity, 0)) AS output_quantity,
          COUNT(CASE WHEN j.required_dispatch_date IS NOT NULL
                      AND DATE((jli.completed_at AT TIME ZONE 'UTC') AT TIME ZONE ${timezone}) <= DATE(j.required_dispatch_date) THEN 1 END) AS on_time_count,
          COUNT(CASE WHEN j.required_dispatch_date IS NOT NULL
                      AND DATE((jli.completed_at AT TIME ZONE 'UTC') AT TIME ZONE ${timezone}) > DATE(j.required_dispatch_date) THEN 1 END) AS late_count
        FROM job_line_items jli
        INNER JOIN jobs j ON jli.job_id = j.id
        WHERE jli.completed = true
          AND jli.completed_at IS NOT NULL
          AND date_trunc('week', (jli.completed_at AT TIME ZONE 'UTC') AT TIME ZONE ${timezone}) >= (SELECT start FROM window_start)
          AND date_trunc('week', (jli.completed_at AT TIME ZONE 'UTC') AT TIME ZONE ${timezone}) <= (SELECT week_end FROM base_week)
        GROUP BY 1
      ),
      errors_by_week AS (
        SELECT
          date_trunc('week', (je.reported_at AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})::date AS week_start,
          COUNT(*) AS total_errors
        FROM job_errors je
        WHERE je.reported_at IS NOT NULL
          AND date_trunc('week', (je.reported_at AT TIME ZONE 'UTC') AT TIME ZONE ${timezone}) >= (SELECT start FROM window_start)
          AND date_trunc('week', (je.reported_at AT TIME ZONE 'UTC') AT TIME ZONE ${timezone}) <= (SELECT week_end FROM base_week)
        GROUP BY 1
      )
      SELECT
        w.week_start::text,
        w.week_end::text,
        COALESCE(ib.active_customers, 0) AS active_customers,
        COALESCE(ib.invoiced_jobs, 0) AS invoiced_jobs,
        COALESCE(ib.job_value, 0) AS job_value,
        COALESCE(ib.avg_job_quantity, 0) AS avg_job_quantity,
        COALESCE(db.on_time_count, 0) AS on_time_count,
        COALESCE(db.late_count, 0) AS late_count,
        COALESCE(db.output_quantity, 0) AS output_quantity,
        COALESCE(eb.total_errors, 0) AS total_errors
      FROM weeks_with_end w
      LEFT JOIN invoiced_by_week ib ON w.week_start = ib.week_start
      LEFT JOIN delivery_by_week db ON w.week_start = db.week_start
      LEFT JOIN errors_by_week eb ON w.week_start = eb.week_start
      ORDER BY w.week_start
    `);

    // Rolling distinct active customers over the whole window (can't sum weekly distinct counts)
    const rollingCustomersResult = await db.execute(sql`
      WITH base_week AS (
        SELECT date_trunc('week', ${endDate}::timestamptz AT TIME ZONE ${timezone}) AS week_end
      )
      SELECT COUNT(DISTINCT j.customer_id) AS active_customers
      FROM jobs j
      WHERE j.invoiced_at IS NOT NULL
        AND date_trunc('week', (j.invoiced_at AT TIME ZONE 'UTC') AT TIME ZONE ${timezone}) >=
            (SELECT week_end FROM base_week) - ((${weeks} - 1) || ' weeks')::interval
        AND date_trunc('week', (j.invoiced_at AT TIME ZONE 'UTC') AT TIME ZONE ${timezone}) <=
            (SELECT week_end FROM base_week)
    `);

    const weekly = result.rows.map((row: any) => {
      const invoicedJobs = parseInt(row.invoiced_jobs) || 0;
      const jobValue = parseFloat(row.job_value) || 0;
      const onTimeCount = parseInt(row.on_time_count) || 0;
      const lateOrders = parseInt(row.late_count) || 0;
      const deliveryTotal = onTimeCount + lateOrders;
      return {
        weekStart: row.week_start,
        weekEnd: row.week_end,
        activeCustomers: parseInt(row.active_customers) || 0,
        invoicedJobs,
        jobValue,
        avgJobValue: invoicedJobs > 0 ? jobValue / invoicedJobs : 0,
        avgJobQuantity: parseFloat(row.avg_job_quantity) || 0,
        onTimeCount,
        lateOrders,
        onTimePercentage: deliveryTotal > 0 ? Math.round((onTimeCount / deliveryTotal) * 100) : 0,
        totalErrors: parseInt(row.total_errors) || 0,
        outputQuantity: parseInt(row.output_quantity) || 0,
      };
    });

    const totJobs = weekly.reduce((s, w) => s + w.invoicedJobs, 0);
    const totValue = weekly.reduce((s, w) => s + w.jobValue, 0);
    const totQty = weekly.reduce((s, w) => s + w.avgJobQuantity * w.invoicedJobs, 0);
    const totOnTime = weekly.reduce((s, w) => s + w.onTimeCount, 0);
    const totLate = weekly.reduce((s, w) => s + w.lateOrders, 0);
    const totDelivery = totOnTime + totLate;

    const rolling = {
      weeks,
      activeCustomers: parseInt((rollingCustomersResult.rows[0] as any)?.active_customers) || 0,
      invoicedJobs: totJobs,
      jobValue: totValue,
      avgJobValue: totJobs > 0 ? totValue / totJobs : 0,
      avgJobQuantity: totJobs > 0 ? totQty / totJobs : 0,
      onTimeCount: totOnTime,
      lateOrders: totLate,
      onTimePercentage: totDelivery > 0 ? Math.round((totOnTime / totDelivery) * 100) : 0,
      totalErrors: weekly.reduce((s, w) => s + w.totalErrors, 0),
      outputQuantity: weekly.reduce((s, w) => s + w.outputQuantity, 0),
    };

    return { weekly, rolling };
  }

  async getAllCustomersWeeklyTrend(params: { weeks?: number; endDate?: Date; timezone?: string; topN?: number }): Promise<{
    weeks: Array<{ weekStart: string; weekEnd: string }>;
    customers: Array<{
      customerId: string;
      customerName: string;
      totalInvoiced: number;
      weekly: Array<{ weekStart: string; invoicedTotal: number }>;
    }>;
  }> {
    const { weeks = 52, endDate = new Date(), timezone = 'Europe/London', topN = 15 } = params;

    const result = await db.execute(sql`
      WITH base_week AS (
        SELECT date_trunc('week', ${endDate}::timestamp AT TIME ZONE ${timezone}) AS week_end
      ),
      week_series AS (
        SELECT
          date_trunc('week',
            (SELECT week_end FROM base_week) - ((${weeks} - 1) || ' weeks')::interval + (n || ' weeks')::interval
          ) AS week_start
        FROM generate_series(0, ${weeks} - 1) AS n
      ),
      weeks_with_end AS (
        SELECT week_start::date, (week_start + '6 days'::interval)::date AS week_end
        FROM week_series
      ),
      invoiced AS (
        SELECT
          j.customer_id,
          date_trunc('week', j.invoiced_at AT TIME ZONE ${timezone})::date AS week_start,
          SUM(j.invoice_total) AS total_invoiced
        FROM jobs j
        WHERE j.invoiced_at IS NOT NULL
          AND j.invoice_total IS NOT NULL
          AND date_trunc('week', j.invoiced_at AT TIME ZONE ${timezone}) >=
              (SELECT week_end FROM base_week) - ((${weeks} - 1) || ' weeks')::interval
          AND date_trunc('week', j.invoiced_at AT TIME ZONE ${timezone}) <=
              (SELECT week_end FROM base_week)
        GROUP BY j.customer_id, 2
      )
      SELECT
        c.id AS customer_id,
        c.name AS customer_name,
        w.week_start::text AS week_start,
        w.week_end::text AS week_end,
        COALESCE(i.total_invoiced, 0) AS invoiced_total
      FROM weeks_with_end w
      CROSS JOIN customers c
      LEFT JOIN invoiced i ON i.customer_id = c.id AND i.week_start = w.week_start
      WHERE c.active = true
      ORDER BY c.name, w.week_start
    `);

    const weekMap = new Map<string, { weekStart: string; weekEnd: string }>();
    const customerMap = new Map<string, {
      customerId: string;
      customerName: string;
      totalInvoiced: number;
      weekly: Array<{ weekStart: string; invoicedTotal: number }>;
    }>();

    for (const row of result.rows as any[]) {
      if (!weekMap.has(row.week_start)) {
        weekMap.set(row.week_start, { weekStart: row.week_start, weekEnd: row.week_end });
      }
      let c = customerMap.get(row.customer_id);
      if (!c) {
        c = { customerId: row.customer_id, customerName: row.customer_name, totalInvoiced: 0, weekly: [] };
        customerMap.set(row.customer_id, c);
      }
      const invoiced = parseFloat(row.invoiced_total) || 0;
      c.weekly.push({ weekStart: row.week_start, invoicedTotal: invoiced });
      c.totalInvoiced += invoiced;
    }

    const weeksArr = Array.from(weekMap.values()).sort((a, b) => a.weekStart.localeCompare(b.weekStart));
    const customers = Array.from(customerMap.values())
      .filter(c => c.totalInvoiced > 0)
      .sort((a, b) => b.totalInvoiced - a.totalInvoiced)
      .slice(0, topN);

    return { weeks: weeksArr, customers };
  }

  async getCustomerWeeklyTrend(params: { customerId: string; weeks?: number; endDate?: Date; timezone?: string }): Promise<Array<{
    weekStart: string;
    weekEnd: string;
    invoicedTotal: number;
    completedQuantity: number;
  }>> {
    const { customerId, weeks = 52, endDate = new Date(), timezone = 'Europe/London' } = params;

    const result = await db.execute(sql`
      WITH base_week AS (
        SELECT date_trunc('week', ${endDate}::timestamp AT TIME ZONE ${timezone}) AS week_end
      ),
      week_series AS (
        SELECT
          date_trunc('week',
            (SELECT week_end FROM base_week) - ((${weeks} - 1) || ' weeks')::interval + (n || ' weeks')::interval
          ) AS week_start
        FROM generate_series(0, ${weeks} - 1) AS n
      ),
      weeks_with_end AS (
        SELECT
          week_start::date,
          (week_start + '6 days'::interval)::date AS week_end
        FROM week_series
      ),
      invoiced_by_week AS (
        SELECT
          date_trunc('week', j.invoiced_at AT TIME ZONE ${timezone})::date AS week_start,
          SUM(j.invoice_total) AS total_invoiced
        FROM jobs j
        WHERE j.invoiced_at IS NOT NULL
          AND j.invoice_total IS NOT NULL
          AND j.customer_id = ${customerId}
          AND date_trunc('week', j.invoiced_at AT TIME ZONE ${timezone}) >=
              (SELECT week_end FROM base_week) - ((${weeks} - 1) || ' weeks')::interval
          AND date_trunc('week', j.invoiced_at AT TIME ZONE ${timezone}) <=
              (SELECT week_end FROM base_week)
        GROUP BY 1
      ),
      completed_by_week AS (
        SELECT
          date_trunc('week', jli.completed_at AT TIME ZONE ${timezone})::date AS week_start,
          SUM(jli.quantity) AS total_quantity
        FROM job_line_items jli
        JOIN jobs j ON j.id = jli.job_id
        WHERE jli.completed_at IS NOT NULL
          AND j.customer_id = ${customerId}
          AND date_trunc('week', jli.completed_at AT TIME ZONE ${timezone}) >=
              (SELECT week_end FROM base_week) - ((${weeks} - 1) || ' weeks')::interval
          AND date_trunc('week', jli.completed_at AT TIME ZONE ${timezone}) <=
              (SELECT week_end FROM base_week)
        GROUP BY 1
      )
      SELECT
        w.week_start::text,
        w.week_end::text,
        COALESCE(ib.total_invoiced, 0) AS invoiced_total,
        COALESCE(cb.total_quantity, 0) AS completed_quantity
      FROM weeks_with_end w
      LEFT JOIN invoiced_by_week ib ON w.week_start = ib.week_start
      LEFT JOIN completed_by_week cb ON w.week_start = cb.week_start
      ORDER BY w.week_start
    `);

    return result.rows.map((row: any) => ({
      weekStart: row.week_start,
      weekEnd: row.week_end,
      invoicedTotal: parseFloat(row.invoiced_total) || 0,
      completedQuantity: parseInt(row.completed_quantity) || 0,
    }));
  }

  async getProductionTimeAnalysis(params: { weeks?: number; endDate?: Date }): Promise<Array<{
    staffName: string;
    machineName: string;
    totalEstimatedMinutes: number;
    totalActualMinutes: number;
    completedItems: number;
    averageAccuracy: number | null;
  }>> {
    const { weeks = 12, endDate = new Date() } = params;
    
    const result = await db.execute(sql`
      WITH date_range AS (
        SELECT 
          ${endDate}::timestamp - ((${weeks} || ' weeks')::interval) AS start_date,
          ${endDate}::timestamp AS end_date
      ),
      completed_items AS (
        SELECT 
          jli.id,
          jli.quantity,
          jli.stitch_count,
          jli.machine_id,
          jli.actual_production_time_minutes,
          jli.completed_at,
          jli.completed_by_id,
          s.name as staff_name,
          CASE 
            WHEN jli.machine_id = 1 THEN 'Barudan 8'
            WHEN jli.machine_id = 2 THEN 'Barudan 6 1'
            WHEN jli.machine_id = 3 THEN 'SWF 6 1'
            WHEN jli.machine_id = 4 THEN 'SWF 6 2'
            WHEN jli.machine_id = 5 THEN 'Barudan 6 2'
            ELSE 'Unknown'
          END as machine_name,
          CASE 
            WHEN jli.machine_id = 1 THEN 8
            WHEN jli.machine_id IN (2, 3, 4, 5) THEN 6
            ELSE 6
          END as machine_heads,
          CEIL(jli.quantity::numeric / CASE 
            WHEN jli.machine_id = 1 THEN 8
            WHEN jli.machine_id IN (2, 3, 4, 5) THEN 6
            ELSE 6
          END) as runs,
          ((jli.stitch_count::numeric / 750.0) + 3) as time_per_run_minutes
        FROM job_line_items jli
        LEFT JOIN staff s ON jli.completed_by_id = s.id
        WHERE jli.completed = true
          AND jli.actual_production_time_minutes IS NOT NULL
          AND jli.completed_at IS NOT NULL
          AND jli.completed_at >= (SELECT start_date FROM date_range)
          AND jli.completed_at <= (SELECT end_date FROM date_range)
          AND jli.job_type = 'Embroidery'
          AND jli.stitch_count > 0
      )
      SELECT 
        COALESCE(staff_name, 'Unassigned') as staff_name,
        machine_name,
        COUNT(*) as completed_items,
        SUM(
          CEIL(
            CEIL((runs * time_per_run_minutes))
            / 10.0
          ) * 10
        ) as total_estimated_minutes,
        SUM(actual_production_time_minutes) as total_actual_minutes,
        CASE 
          WHEN SUM(
            CEIL(
              CEIL((runs * time_per_run_minutes))
              / 10.0
            ) * 10
          ) > 0 
          THEN (
            SUM(actual_production_time_minutes)::numeric / 
            SUM(
              CEIL(
                CEIL((runs * time_per_run_minutes))
                / 10.0
              ) * 10
            ) * 100
          )
          ELSE NULL
        END as average_accuracy
      FROM completed_items
      GROUP BY staff_name, machine_name
      HAVING COUNT(*) > 0
      ORDER BY staff_name, machine_name
    `);

    return result.rows.map((row: any) => ({
      staffName: row.staff_name,
      machineName: row.machine_name,
      totalEstimatedMinutes: Number(row.total_estimated_minutes) || 0,
      totalActualMinutes: Number(row.total_actual_minutes) || 0,
      completedItems: parseInt(row.completed_items) || 0,
      averageAccuracy: row.average_accuracy !== null ? parseFloat(row.average_accuracy) : null,
    }));
  }

  async createImpersonationSession(data: { 
    token: string; 
    staffUserId: string; 
    customerUserId: string; 
    expiresAt: Date 
  }): Promise<any> {
    // Hash the token before storing
    const tokenHash = createHash('sha256').update(data.token).digest('hex');
    
    const [session] = await db
      .insert(impersonationSessions)
      .values({
        tokenHash,
        staffUserId: data.staffUserId,
        customerUserId: data.customerUserId,
        expiresAt: data.expiresAt,
        active: true,
      })
      .returning();
    return session;
  }

  async getImpersonationSession(token: string): Promise<any | undefined> {
    // Hash the token for lookup
    const tokenHash = createHash('sha256').update(token).digest('hex');
    
    const [session] = await db
      .select()
      .from(impersonationSessions)
      .where(
        and(
          eq(impersonationSessions.tokenHash, tokenHash),
          eq(impersonationSessions.active, true),
          gte(impersonationSessions.expiresAt, new Date())
        )
      );
    return session;
  }

  async invalidateImpersonationSession(token: string): Promise<void> {
    // Hash the token for lookup
    const tokenHash = createHash('sha256').update(token).digest('hex');
    
    await db
      .update(impersonationSessions)
      .set({ active: false })
      .where(eq(impersonationSessions.tokenHash, tokenHash));
  }

  // Job error tracking methods
  async getJobErrors(jobId: string): Promise<JobError[]> {
    return await db
      .select()
      .from(jobErrors)
      .where(eq(jobErrors.jobId, jobId))
      .orderBy(sql`${jobErrors.reportedAt} DESC`);
  }

  async getJobError(id: string): Promise<JobError | undefined> {
    const [error] = await db
      .select()
      .from(jobErrors)
      .where(eq(jobErrors.id, id));
    return error;
  }

  async createJobError(error: InsertJobError): Promise<JobError> {
    const [created] = await db
      .insert(jobErrors)
      .values(error)
      .returning();
    return created;
  }

  async updateJobError(id: string, error: Partial<JobError>): Promise<JobError> {
    const [updated] = await db
      .update(jobErrors)
      .set(error)
      .where(eq(jobErrors.id, id))
      .returning();
    return updated;
  }

  async deleteJobError(id: string): Promise<void> {
    await db.delete(jobErrors).where(eq(jobErrors.id, id));
  }

  async getUnresolvedJobErrors(): Promise<JobError[]> {
    return await db
      .select()
      .from(jobErrors)
      .where(eq(jobErrors.resolved, false))
      .orderBy(sql`${jobErrors.reportedAt} DESC`);
  }

  async getAllJobErrors(): Promise<JobError[]> {
    return await db
      .select()
      .from(jobErrors)
      .orderBy(sql`${jobErrors.reportedAt} DESC`);
  }

  // Enhanced Weekly Reports - Staff Performance (on-time vs late)
  async getStaffPerformanceReport(options: { weeks?: number; endDate?: Date } = {}): Promise<{
    staffMetrics: Array<{
      staffId: string;
      staffName: string;
      onTimeCount: number;
      lateCount: number;
      totalCompleted: number;
      onTimePercentage: number;
    }>;
    teamTotals: {
      onTimeCount: number;
      lateCount: number;
      totalCompleted: number;
      onTimePercentage: number;
    };
  }> {
    const weeks = options.weeks || 12;
    const endDate = options.endDate || new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - (weeks * 7));

    const result = await db.execute(sql`
      SELECT
        s.id as staff_id,
        s.name as staff_name,
        COUNT(CASE WHEN j.required_dispatch_date IS NOT NULL
                    AND DATE(jli.completed_at) <= DATE(j.required_dispatch_date) THEN 1 END) as on_time_count,
        COUNT(CASE WHEN j.required_dispatch_date IS NOT NULL
                    AND DATE(jli.completed_at) > DATE(j.required_dispatch_date) THEN 1 END) as late_count,
        COUNT(jli.id) as total_completed
      FROM job_line_items jli
      INNER JOIN staff s ON jli.completed_by_id = s.id
      INNER JOIN jobs j ON jli.job_id = j.id
      WHERE jli.completed = true
        AND jli.completed_at IS NOT NULL
        AND j.required_dispatch_date IS NOT NULL
        AND jli.completed_at >= ${startDate}
        AND jli.completed_at <= ${endDate}
      GROUP BY s.id, s.name
      ORDER BY COUNT(jli.id) DESC
    `);

    const staffMetrics = (result.rows as any[]).map(row => ({
      staffId: row.staff_id,
      staffName: row.staff_name,
      onTimeCount: parseInt(row.on_time_count) || 0,
      lateCount: parseInt(row.late_count) || 0,
      totalCompleted: parseInt(row.total_completed) || 0,
      onTimePercentage: parseInt(row.total_completed) > 0 
        ? Math.round((parseInt(row.on_time_count) / parseInt(row.total_completed)) * 100) 
        : 0,
    }));

    const teamTotals = staffMetrics.reduce(
      (acc, staff) => ({
        onTimeCount: acc.onTimeCount + staff.onTimeCount,
        lateCount: acc.lateCount + staff.lateCount,
        totalCompleted: acc.totalCompleted + staff.totalCompleted,
        onTimePercentage: 0,
      }),
      { onTimeCount: 0, lateCount: 0, totalCompleted: 0, onTimePercentage: 0 }
    );
    teamTotals.onTimePercentage = teamTotals.totalCompleted > 0 
      ? Math.round((teamTotals.onTimeCount / teamTotals.totalCompleted) * 100) 
      : 0;

    return { staffMetrics, teamTotals };
  }

  // Enhanced Weekly Reports - Errors per person and team
  async getErrorsReport(options: { weeks?: number; endDate?: Date } = {}): Promise<{
    staffErrors: Array<{
      staffId: string | null;
      staffName: string;
      errorCount: number;
      resolvedCount: number;
      unresolvedCount: number;
    }>;
    teamTotals: {
      totalErrors: number;
      resolvedCount: number;
      unresolvedCount: number;
    };
  }> {
    const weeks = options.weeks || 12;
    const endDate = options.endDate || new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - (weeks * 7));

    const result = await db.execute(sql`
      SELECT 
        je.assigned_to_id as staff_id,
        COALESCE(s.name, 'Unassigned') as staff_name,
        COUNT(je.id) as error_count,
        COUNT(CASE WHEN je.resolved = true THEN 1 END) as resolved_count,
        COUNT(CASE WHEN je.resolved = false THEN 1 END) as unresolved_count
      FROM job_errors je
      LEFT JOIN staff s ON je.assigned_to_id = s.id
      WHERE je.reported_at >= ${startDate}
        AND je.reported_at <= ${endDate}
      GROUP BY je.assigned_to_id, s.name
      ORDER BY COUNT(je.id) DESC
    `);

    const staffErrors = (result.rows as any[]).map(row => ({
      staffId: row.staff_id,
      staffName: row.staff_name,
      errorCount: parseInt(row.error_count) || 0,
      resolvedCount: parseInt(row.resolved_count) || 0,
      unresolvedCount: parseInt(row.unresolved_count) || 0,
    }));

    const teamTotals = staffErrors.reduce(
      (acc, staff) => ({
        totalErrors: acc.totalErrors + staff.errorCount,
        resolvedCount: acc.resolvedCount + staff.resolvedCount,
        unresolvedCount: acc.unresolvedCount + staff.unresolvedCount,
      }),
      { totalErrors: 0, resolvedCount: 0, unresolvedCount: 0 }
    );

    return { staffErrors, teamTotals };
  }

  // Enhanced Weekly Reports - Daily production (stitches and items per employee)
  async getDailyProductionReport(options: { weeks?: number; endDate?: Date } = {}): Promise<{
    dailyData: Array<{
      date: string;
      staffId: string;
      staffName: string;
      totalStitches: number;
      totalItems: number;
      actualMinutes: number;
      estimatedMinutes: number;
    }>;
    staffSummary: Array<{
      staffId: string;
      staffName: string;
      avgDailyStitches: number;
      avgDailyItems: number;
      totalStitches: number;
      totalItems: number;
      totalActualMinutes: number;
      totalEstimatedMinutes: number;
      accuracyPercentage: number;
    }>;
  }> {
    const weeks = options.weeks || 12;
    const endDate = options.endDate || new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - (weeks * 7));

    // Daily breakdown
    const dailyResult = await db.execute(sql`
      SELECT 
        DATE(jli.completed_at) as completion_date,
        jli.completed_by_id as staff_id,
        s.name as staff_name,
        COALESCE(SUM(jli.quantity * COALESCE(jli.stitch_count, 0)), 0) as total_stitches,
        COALESCE(SUM(jli.quantity), 0) as total_items,
        COALESCE(SUM(jli.actual_production_time_minutes), 0) as actual_minutes,
        COALESCE(SUM(CEIL((jli.quantity::numeric * COALESCE(jli.stitch_count, 0)) / 1000)), 0) as estimated_minutes
      FROM job_line_items jli
      INNER JOIN staff s ON jli.completed_by_id = s.id
      WHERE jli.completed = true
        AND jli.completed_at >= ${startDate}
        AND jli.completed_at <= ${endDate}
        AND jli.completed_by_id IS NOT NULL
      GROUP BY DATE(jli.completed_at), jli.completed_by_id, s.name
      ORDER BY DATE(jli.completed_at) DESC, s.name
    `);

    const dailyData = (dailyResult.rows as any[]).map(row => ({
      date: row.completion_date,
      staffId: row.staff_id,
      staffName: row.staff_name,
      totalStitches: parseInt(row.total_stitches) || 0,
      totalItems: parseInt(row.total_items) || 0,
      actualMinutes: parseInt(row.actual_minutes) || 0,
      estimatedMinutes: parseInt(row.estimated_minutes) || 0,
    }));

    // Staff summary with averages
    const summaryResult = await db.execute(sql`
      WITH daily_totals AS (
        SELECT 
          jli.completed_by_id as staff_id,
          s.name as staff_name,
          DATE(jli.completed_at) as work_date,
          COALESCE(SUM(jli.quantity * COALESCE(jli.stitch_count, 0)), 0) as daily_stitches,
          COALESCE(SUM(jli.quantity), 0) as daily_items,
          COALESCE(SUM(jli.actual_production_time_minutes), 0) as daily_actual,
          COALESCE(SUM(CEIL((jli.quantity::numeric * COALESCE(jli.stitch_count, 0)) / 1000)), 0) as daily_estimated
        FROM job_line_items jli
        INNER JOIN staff s ON jli.completed_by_id = s.id
        WHERE jli.completed = true
          AND jli.completed_at >= ${startDate}
          AND jli.completed_at <= ${endDate}
          AND jli.completed_by_id IS NOT NULL
        GROUP BY jli.completed_by_id, s.name, DATE(jli.completed_at)
      )
      SELECT 
        staff_id,
        staff_name,
        ROUND(AVG(daily_stitches)) as avg_daily_stitches,
        ROUND(AVG(daily_items)) as avg_daily_items,
        SUM(daily_stitches) as total_stitches,
        SUM(daily_items) as total_items,
        SUM(daily_actual) as total_actual_minutes,
        SUM(daily_estimated) as total_estimated_minutes,
        COUNT(DISTINCT work_date) as days_worked
      FROM daily_totals
      GROUP BY staff_id, staff_name
      ORDER BY SUM(daily_stitches) DESC
    `);

    const staffSummary = (summaryResult.rows as any[]).map(row => ({
      staffId: row.staff_id,
      staffName: row.staff_name,
      avgDailyStitches: parseInt(row.avg_daily_stitches) || 0,
      avgDailyItems: parseInt(row.avg_daily_items) || 0,
      totalStitches: parseInt(row.total_stitches) || 0,
      totalItems: parseInt(row.total_items) || 0,
      totalActualMinutes: parseInt(row.total_actual_minutes) || 0,
      totalEstimatedMinutes: parseInt(row.total_estimated_minutes) || 0,
      accuracyPercentage: parseInt(row.total_estimated_minutes) > 0
        ? Math.round((parseInt(row.total_actual_minutes) / parseInt(row.total_estimated_minutes)) * 100)
        : 0,
    }));

    return { dailyData, staffSummary };
  }

  // Weekly production breakdown by staff with efficiency score
  // Uses production_entries for partial work + completed line items for final completions
  async getWeeklyProductionByStaff(options: { weeks?: number; endDate?: Date } = {}): Promise<{
    weeklyData: Array<{
      weekNumber: number;
      weekStart: string;
      weekEnd: string;
      staffId: string;
      staffName: string;
      avgDailyStitches: number;
      avgDailyItems: number;
      totalStitches: number;
      totalItems: number;
      totalActualMinutes: number;
      totalEstimatedMinutes: number;
      efficiencyScore: number; // actual/estimated ratio - 1 is perfect, 2 means took twice as long
      daysWorked: number;
    }>;
    staffTotals: Array<{
      staffId: string;
      staffName: string;
      avgDailyStitches: number;
      avgDailyItems: number;
      totalStitches: number;
      totalItems: number;
      totalActualMinutes: number;
      totalEstimatedMinutes: number;
      efficiencyScore: number;
    }>;
  }> {
    const numWeeks = options.weeks || 12;
    const endDate = options.endDate || new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - (numWeeks * 7));

    // Weekly breakdown per staff member - combines production_entries and completed line items
    const weeklyResult = await db.execute(sql`
      WITH production_entry_data AS (
        -- Production entries track partial daily work
        SELECT 
          pe.staff_id,
          s.name as staff_name,
          DATE(pe.work_date) as work_date,
          DATE_TRUNC('week', pe.work_date) as week_start,
          pe.quantity_completed * COALESCE(jli.stitch_count, 0) as stitches,
          pe.quantity_completed as items,
          pe.production_time_minutes as actual_minutes,
          CEIL((pe.quantity_completed::numeric * COALESCE(jli.stitch_count, 0)) / 1000) as estimated_minutes
        FROM production_entries pe
        INNER JOIN staff s ON pe.staff_id = s.id
        INNER JOIN job_line_items jli ON pe.line_item_id = jli.id
        WHERE pe.work_date >= ${startDate}
          AND pe.work_date <= ${endDate}
      ),
      completed_line_item_data AS (
        -- Credit the completer ONLY the quantity not already logged via
        -- production entries by colleagues. (e.g. if Ella logged 200 of 300 and
        -- Dave completes, Dave is credited the remaining 100, not the full 300.)
        SELECT 
          jli.completed_by_id as staff_id,
          s.name as staff_name,
          DATE(jli.completed_at) as work_date,
          DATE_TRUNC('week', jli.completed_at) as week_start,
          (jli.quantity - COALESCE(pe_sum.total, 0)) * COALESCE(jli.stitch_count, 0) as stitches,
          (jli.quantity - COALESCE(pe_sum.total, 0)) as items,
          COALESCE(jli.actual_production_time_minutes, 0) as actual_minutes,
          CEIL(((jli.quantity - COALESCE(pe_sum.total, 0))::numeric * COALESCE(jli.stitch_count, 0)) / 1000) as estimated_minutes
        FROM job_line_items jli
        INNER JOIN staff s ON jli.completed_by_id = s.id
        LEFT JOIN (
          SELECT line_item_id, SUM(quantity_completed) as total
          FROM production_entries
          GROUP BY line_item_id
        ) pe_sum ON pe_sum.line_item_id = jli.id
        WHERE jli.completed = true
          AND jli.completed_at >= ${startDate}
          AND jli.completed_at <= ${endDate}
          AND jli.completed_by_id IS NOT NULL
          AND jli.quantity > COALESCE(pe_sum.total, 0)
      ),
      all_work AS (
        SELECT * FROM production_entry_data
        UNION ALL
        SELECT * FROM completed_line_item_data
      ),
      daily_totals AS (
        SELECT 
          staff_id,
          staff_name,
          work_date,
          week_start,
          SUM(stitches) as daily_stitches,
          SUM(items) as daily_items,
          SUM(actual_minutes) as daily_actual,
          SUM(estimated_minutes) as daily_estimated
        FROM all_work
        GROUP BY staff_id, staff_name, work_date, week_start
      )
      SELECT 
        staff_id,
        staff_name,
        week_start,
        week_start + INTERVAL '6 days' as week_end,
        ROUND(AVG(daily_stitches)) as avg_daily_stitches,
        ROUND(AVG(daily_items)) as avg_daily_items,
        SUM(daily_stitches) as total_stitches,
        SUM(daily_items) as total_items,
        SUM(daily_actual) as total_actual_minutes,
        SUM(daily_estimated) as total_estimated_minutes,
        COUNT(DISTINCT work_date) as days_worked
      FROM daily_totals
      GROUP BY staff_id, staff_name, week_start
      ORDER BY week_start DESC, staff_name
    `);

    // Calculate week numbers and format data
    const weeklyData = (weeklyResult.rows as any[]).map((row, index, arr) => {
      const totalEstimated = parseInt(row.total_estimated_minutes) || 0;
      const totalActual = parseInt(row.total_actual_minutes) || 0;
      const efficiencyScore = totalEstimated > 0 
        ? Math.round((totalActual / totalEstimated) * 100) / 100
        : 0;

      // Calculate week number relative to the current week
      const weekStart = new Date(row.week_start);
      const weeksDiff = Math.floor((endDate.getTime() - weekStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
      const weekNumber = weeksDiff + 1;

      return {
        weekNumber,
        weekStart: row.week_start,
        weekEnd: row.week_end,
        staffId: row.staff_id,
        staffName: row.staff_name,
        avgDailyStitches: parseInt(row.avg_daily_stitches) || 0,
        avgDailyItems: parseInt(row.avg_daily_items) || 0,
        totalStitches: parseInt(row.total_stitches) || 0,
        totalItems: parseInt(row.total_items) || 0,
        totalActualMinutes: parseInt(row.total_actual_minutes) || 0,
        totalEstimatedMinutes: parseInt(row.total_estimated_minutes) || 0,
        efficiencyScore,
        daysWorked: parseInt(row.days_worked) || 0,
      };
    });

    // Staff totals across all weeks - combines production_entries and completed line items
    const staffTotalsResult = await db.execute(sql`
      WITH production_entry_data AS (
        SELECT 
          pe.staff_id,
          s.name as staff_name,
          DATE(pe.work_date) as work_date,
          pe.quantity_completed * COALESCE(jli.stitch_count, 0) as stitches,
          pe.quantity_completed as items,
          pe.production_time_minutes as actual_minutes,
          CEIL((pe.quantity_completed::numeric * COALESCE(jli.stitch_count, 0)) / 1000) as estimated_minutes
        FROM production_entries pe
        INNER JOIN staff s ON pe.staff_id = s.id
        INNER JOIN job_line_items jli ON pe.line_item_id = jli.id
        WHERE pe.work_date >= ${startDate}
          AND pe.work_date <= ${endDate}
      ),
      completed_line_item_data AS (
        -- Credit the completer ONLY the quantity not already logged via
        -- production entries by colleagues (the remainder), to avoid double
        -- counting partial work that other staff already recorded.
        SELECT 
          jli.completed_by_id as staff_id,
          s.name as staff_name,
          DATE(jli.completed_at) as work_date,
          (jli.quantity - COALESCE(pe_sum.total, 0)) * COALESCE(jli.stitch_count, 0) as stitches,
          (jli.quantity - COALESCE(pe_sum.total, 0)) as items,
          COALESCE(jli.actual_production_time_minutes, 0) as actual_minutes,
          CEIL(((jli.quantity - COALESCE(pe_sum.total, 0))::numeric * COALESCE(jli.stitch_count, 0)) / 1000) as estimated_minutes
        FROM job_line_items jli
        INNER JOIN staff s ON jli.completed_by_id = s.id
        LEFT JOIN (
          SELECT line_item_id, SUM(quantity_completed) as total
          FROM production_entries
          GROUP BY line_item_id
        ) pe_sum ON pe_sum.line_item_id = jli.id
        WHERE jli.completed = true
          AND jli.completed_at >= ${startDate}
          AND jli.completed_at <= ${endDate}
          AND jli.completed_by_id IS NOT NULL
          AND jli.quantity > COALESCE(pe_sum.total, 0)
      ),
      all_work AS (
        SELECT * FROM production_entry_data
        UNION ALL
        SELECT * FROM completed_line_item_data
      ),
      daily_totals AS (
        SELECT 
          staff_id,
          staff_name,
          work_date,
          SUM(stitches) as daily_stitches,
          SUM(items) as daily_items,
          SUM(actual_minutes) as daily_actual,
          SUM(estimated_minutes) as daily_estimated
        FROM all_work
        GROUP BY staff_id, staff_name, work_date
      )
      SELECT 
        staff_id,
        staff_name,
        ROUND(AVG(daily_stitches)) as avg_daily_stitches,
        ROUND(AVG(daily_items)) as avg_daily_items,
        SUM(daily_stitches) as total_stitches,
        SUM(daily_items) as total_items,
        SUM(daily_actual) as total_actual_minutes,
        SUM(daily_estimated) as total_estimated_minutes
      FROM daily_totals
      GROUP BY staff_id, staff_name
      ORDER BY SUM(daily_stitches) DESC
    `);

    const staffTotals = (staffTotalsResult.rows as any[]).map(row => {
      const totalEstimated = parseInt(row.total_estimated_minutes) || 0;
      const totalActual = parseInt(row.total_actual_minutes) || 0;
      const efficiencyScore = totalEstimated > 0 
        ? Math.round((totalActual / totalEstimated) * 100) / 100
        : 0;

      return {
        staffId: row.staff_id,
        staffName: row.staff_name,
        avgDailyStitches: parseInt(row.avg_daily_stitches) || 0,
        avgDailyItems: parseInt(row.avg_daily_items) || 0,
        totalStitches: parseInt(row.total_stitches) || 0,
        totalItems: parseInt(row.total_items) || 0,
        totalActualMinutes: parseInt(row.total_actual_minutes) || 0,
        totalEstimatedMinutes: parseInt(row.total_estimated_minutes) || 0,
        efficiencyScore,
      };
    });

    return { weeklyData, staffTotals };
  }

  async getDailyOutputByStaff(options: { days?: number; endDate?: Date } = {}): Promise<{
    dailyData: Array<{
      workDate: string;
      staffId: string;
      staffName: string;
      totalStitches: number;
      totalItems: number;
    }>;
  }> {
    const numDays = options.days || 30;
    const endDate = options.endDate || new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - numDays);

    // Per-day, per-staff embroidery output. Combines production_entries (partial
    // daily work) with completed line items that have no production entries.
    // Mirrors getWeeklyProductionByStaff but keeps daily granularity (no weekly
    // averaging) and filters to embroidery only.
    const result = await db.execute(sql`
      WITH production_entry_data AS (
        SELECT
          pe.staff_id,
          s.name as staff_name,
          DATE(pe.work_date) as work_date,
          pe.quantity_completed * COALESCE(jli.stitch_count, 0) as stitches,
          pe.quantity_completed as items
        FROM production_entries pe
        INNER JOIN staff s ON pe.staff_id = s.id
        INNER JOIN job_line_items jli ON pe.line_item_id = jli.id
        WHERE pe.work_date >= ${startDate}
          AND pe.work_date <= ${endDate}
          AND LOWER(jli.job_type) = 'embroidery'
      ),
      completed_line_item_data AS (
        -- Credit the completer ONLY the remaining quantity not already logged
        -- via production entries by colleagues, to avoid double counting.
        SELECT
          jli.completed_by_id as staff_id,
          s.name as staff_name,
          DATE(jli.completed_at) as work_date,
          (jli.quantity - COALESCE(pe_sum.total, 0)) * COALESCE(jli.stitch_count, 0) as stitches,
          (jli.quantity - COALESCE(pe_sum.total, 0)) as items
        FROM job_line_items jli
        INNER JOIN staff s ON jli.completed_by_id = s.id
        LEFT JOIN (
          SELECT line_item_id, SUM(quantity_completed) as total
          FROM production_entries
          GROUP BY line_item_id
        ) pe_sum ON pe_sum.line_item_id = jli.id
        WHERE jli.completed = true
          AND jli.completed_at >= ${startDate}
          AND jli.completed_at <= ${endDate}
          AND jli.completed_by_id IS NOT NULL
          AND LOWER(jli.job_type) = 'embroidery'
          AND jli.quantity > COALESCE(pe_sum.total, 0)
      ),
      all_work AS (
        SELECT * FROM production_entry_data
        UNION ALL
        SELECT * FROM completed_line_item_data
      )
      SELECT
        staff_id,
        staff_name,
        work_date,
        SUM(stitches) as total_stitches,
        SUM(items) as total_items
      FROM all_work
      GROUP BY staff_id, staff_name, work_date
      ORDER BY work_date ASC, staff_name
    `);

    const dailyData = (result.rows as any[]).map((row) => {
      const wd = row.work_date;
      const workDate = wd instanceof Date
        ? wd.toISOString().split('T')[0]
        : String(wd).split('T')[0];
      return {
        workDate,
        staffId: row.staff_id,
        staffName: row.staff_name,
        totalStitches: parseInt(row.total_stitches) || 0,
        totalItems: parseInt(row.total_items) || 0,
      };
    });

    return { dailyData };
  }

  // Production lead-time metrics: measures how long jobs take, in working days
  // (excluding weekends and bank holidays). Returns two measures per completed
  // job:
  //   - bookingToDispatch: working days from when the customer submitted the
  //     job to when it was completed/dispatched.
  //   - productionWindow: working days from when the job genuinely joined the
  //     queue (the LATER of goods received and logo approved) to completion.
  // Jobs missing the required start dates are excluded from that measure's
  // average (older jobs have no logo-approval date, so their production window
  // cannot be calculated reliably).
  async getProductionTimeMetrics(options: { days?: number; endDate?: Date } = {}): Promise<{
    summary: {
      bookingToDispatch: { avgDays: number | null; jobCount: number };
      productionWindow: { avgDays: number | null; jobCount: number };
    };
    jobs: Array<{
      jobId: string;
      jobNumber: number | null;
      jobName: string;
      customerName: string;
      submittedAt: string | null;
      queueJoinDate: string | null;
      completedAt: string | null;
      bookingDays: number | null;
      productionDays: number | null;
    }>;
  }> {
    const numDays = options.days || 90;
    const endDate = options.endDate || new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - numDays);

    // All business dates are computed in the UK timezone. The date columns are
    // `timestamp` (no zone) holding UTC instants, so we re-interpret each value
    // as UTC then convert to Europe/London before truncating to a calendar date.
    // This avoids late-night timestamps being attributed to the wrong day (and
    // therefore the wrong weekday / bank-holiday classification).
    const ukDate = (col: any) =>
      sql`to_char((${col} AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/London')::date, 'YYYY-MM-DD')`;

    const result = await db.execute(sql`
      SELECT
        j.id,
        j.job_number,
        j.job_name,
        c.name AS customer_name,
        ${ukDate(sql`j.submitted_at`)} AS submitted_date,
        ${ukDate(sql`j.goods_received`)} AS goods_received_date,
        ${ukDate(sql`MAX(jli.completed_at)`)} AS completed_date,
        ${ukDate(sql`MAX(jli.logo_approved_at)`)} AS logo_approved_date,
        BOOL_AND(jli.logo_approved AND jli.logo_approved_at IS NOT NULL) AS all_logos_approved
      FROM jobs j
      INNER JOIN job_line_items jli ON jli.job_id = j.id
      INNER JOIN customers c ON c.id = j.customer_id
      WHERE j.completed = true
      GROUP BY j.id, c.name
      HAVING MAX(jli.completed_at) >= ${startDate}
        AND MAX(jli.completed_at) <= ${endDate}
      ORDER BY MAX(jli.completed_at) DESC
    `);

    const holidayResult = await db.execute(
      sql`SELECT ${ukDate(sql`date`)} AS d FROM bank_holidays`
    );
    const holidaySet = new Set<string>(
      (holidayResult.rows as any[]).map((r) => r.d).filter((d): d is string => !!d)
    );

    // Parse a 'YYYY-MM-DD' string into a timezone-safe UTC-midnight anchor.
    const parseDate = (value: any): Date | null => {
      if (!value || typeof value !== 'string') return null;
      const d = new Date(`${value}T00:00:00Z`);
      return isNaN(d.getTime()) ? null : d;
    };

    // Count working days in the interval (start, end]: each calendar day after
    // the start, up to and including the end, that is not a weekend or bank
    // holiday. Same-day start/end yields 0.
    const countWorkingDays = (start: Date | null, end: Date | null): number | null => {
      if (!start || !end) return null;
      if (end.getTime() <= start.getTime()) return 0;
      let count = 0;
      const cursor = new Date(start.getTime());
      while (cursor.getTime() < end.getTime()) {
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        const dow = cursor.getUTCDay();
        const ymd = cursor.toISOString().split('T')[0];
        if (dow !== 0 && dow !== 6 && !holidaySet.has(ymd)) count++;
      }
      return count;
    };

    const jobs = (result.rows as any[]).map((row) => {
      const submittedAt = parseDate(row.submitted_date);
      const goodsReceived = parseDate(row.goods_received_date);
      const logoApprovedAt = parseDate(row.logo_approved_date);
      const completedAt = parseDate(row.completed_date);
      const allLogosApproved = row.all_logos_approved === true;

      // Queue-join = the later of goods received and logo approved. The window
      // is only measurable when goods are in AND every line item's logo is
      // approved with a recorded date (older jobs lack that date, so they are
      // excluded rather than measured inaccurately).
      let queueJoin: Date | null = null;
      if (goodsReceived && logoApprovedAt && allLogosApproved) {
        queueJoin = goodsReceived.getTime() >= logoApprovedAt.getTime() ? goodsReceived : logoApprovedAt;
      }

      const bookingDays = countWorkingDays(submittedAt, completedAt);
      const productionDays = countWorkingDays(queueJoin, completedAt);

      return {
        jobId: row.id as string,
        jobNumber: row.job_number != null ? Number(row.job_number) : null,
        jobName: row.job_name as string,
        customerName: row.customer_name as string,
        submittedAt: row.submitted_date ?? null,
        queueJoinDate: queueJoin ? queueJoin.toISOString().split('T')[0] : null,
        completedAt: row.completed_date ?? null,
        bookingDays,
        productionDays,
      };
    });

    const bookingValues = jobs.map((j) => j.bookingDays).filter((d): d is number => d !== null);
    const productionValues = jobs.map((j) => j.productionDays).filter((d): d is number => d !== null);
    const avg = (arr: number[]): number | null =>
      arr.length ? Math.round((arr.reduce((s, n) => s + n, 0) / arr.length) * 10) / 10 : null;

    return {
      summary: {
        bookingToDispatch: { avgDays: avg(bookingValues), jobCount: bookingValues.length },
        productionWindow: { avgDays: avg(productionValues), jobCount: productionValues.length },
      },
      jobs,
    };
  }

  // Customer documents methods
  async getCustomerDocuments(): Promise<CustomerDocument[]> {
    return await db
      .select()
      .from(customerDocuments)
      .orderBy(sql`${customerDocuments.sortOrder} ASC, ${customerDocuments.createdAt} DESC`);
  }

  async getActiveCustomerDocuments(): Promise<CustomerDocument[]> {
    return await db
      .select()
      .from(customerDocuments)
      .where(eq(customerDocuments.active, true))
      .orderBy(sql`${customerDocuments.sortOrder} ASC, ${customerDocuments.createdAt} DESC`);
  }

  async getCustomerDocument(id: string): Promise<CustomerDocument | undefined> {
    const [doc] = await db.select().from(customerDocuments).where(eq(customerDocuments.id, id));
    return doc;
  }

  async createCustomerDocument(doc: InsertCustomerDocument): Promise<CustomerDocument> {
    const [created] = await db
      .insert(customerDocuments)
      .values(doc)
      .returning();
    return created;
  }

  async updateCustomerDocument(id: string, doc: Partial<CustomerDocument>): Promise<CustomerDocument> {
    const [updated] = await db
      .update(customerDocuments)
      .set({ ...doc, updatedAt: new Date() })
      .where(eq(customerDocuments.id, id))
      .returning();
    return updated;
  }

  async deleteCustomerDocument(id: string): Promise<void> {
    await db.delete(customerDocuments).where(eq(customerDocuments.id, id));
  }

  // Direct conversations
  async getConversations(): Promise<Conversation[]> {
    return await db.select().from(conversations).orderBy(desc(conversations.updatedAt));
  }

  async getConversationsByCustomer(customerId: string): Promise<Conversation[]> {
    return await db.select().from(conversations)
      .where(eq(conversations.customerId, customerId))
      .orderBy(desc(conversations.updatedAt));
  }

  async getConversation(id: string): Promise<Conversation | undefined> {
    const [row] = await db.select().from(conversations).where(eq(conversations.id, id));
    return row;
  }

  async createConversation(data: InsertConversation): Promise<Conversation> {
    const [row] = await db.insert(conversations).values(data).returning();
    return row;
  }

  async updateConversation(id: string, data: Partial<Conversation>): Promise<Conversation> {
    const [row] = await db.update(conversations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(conversations.id, id))
      .returning();
    return row;
  }

  async getConversationMessages(conversationId: string): Promise<ConversationMessage[]> {
    return await db.select().from(conversationMessages)
      .where(eq(conversationMessages.conversationId, conversationId))
      .orderBy(conversationMessages.createdAt);
  }

  async createConversationMessage(data: InsertConversationMessage): Promise<ConversationMessage> {
    const [row] = await db.insert(conversationMessages).values(data).returning();
    // Bump parent conversation updatedAt
    await db.update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, data.conversationId));
    return row;
  }

  async markConversationMessagesReadByStaff(conversationId: string): Promise<void> {
    await db.update(conversationMessages)
      .set({ readByStaff: true })
      .where(and(eq(conversationMessages.conversationId, conversationId), eq(conversationMessages.readByStaff, false)));
  }

  async markConversationMessagesReadByCustomer(conversationId: string): Promise<void> {
    await db.update(conversationMessages)
      .set({ readByCustomer: true })
      .where(and(eq(conversationMessages.conversationId, conversationId), eq(conversationMessages.readByCustomer, false)));
  }

  async getUnreadConversationCountForStaff(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(conversationMessages)
      .where(and(eq(conversationMessages.senderType, 'customer'), eq(conversationMessages.readByStaff, false)));
    return Number(result[0]?.count ?? 0);
  }

  async getUnreadConversationCountForCustomer(customerId: string): Promise<number> {
    const customerConvos = await db.select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.customerId, customerId));
    if (customerConvos.length === 0) return 0;
    const ids = customerConvos.map(c => c.id);
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(conversationMessages)
      .where(and(inArray(conversationMessages.conversationId, ids), eq(conversationMessages.senderType, 'staff'), eq(conversationMessages.readByCustomer, false)));
    return Number(result[0]?.count ?? 0);
  }

  // Samples
  async getSamples(): Promise<Sample[]> {
    return await db.select().from(samples).orderBy(desc(samples.updatedAt));
  }

  async getSamplesByCustomer(customerId: string): Promise<Sample[]> {
    return await db.select().from(samples)
      .where(eq(samples.customerId, customerId))
      .orderBy(desc(samples.updatedAt));
  }

  async getSample(id: string): Promise<Sample | undefined> {
    const [row] = await db.select().from(samples).where(eq(samples.id, id));
    return row;
  }

  async createSample(data: InsertSample): Promise<Sample> {
    const [row] = await db.insert(samples).values(data).returning();
    return row;
  }

  async updateSample(id: string, data: Partial<Sample>): Promise<Sample> {
    const [row] = await db.update(samples)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(samples.id, id))
      .returning();
    return row;
  }

  async deleteSample(id: string): Promise<void> {
    await db.delete(samples).where(eq(samples.id, id));
  }

  async getSampleFiles(sampleId: string): Promise<SampleFile[]> {
    return await db.select().from(sampleFiles)
      .where(eq(sampleFiles.sampleId, sampleId))
      .orderBy(sampleFiles.createdAt);
  }

  async createSampleFile(data: InsertSampleFile): Promise<SampleFile> {
    const [row] = await db.insert(sampleFiles).values(data).returning();
    return row;
  }

  async deleteSampleFile(id: string): Promise<void> {
    await db.delete(sampleFiles).where(eq(sampleFiles.id, id));
  }

  async getMachines(): Promise<Machine[]> {
    return await db.select().from(machines).orderBy(machines.id);
  }

  async getMachine(id: number): Promise<Machine | undefined> {
    const [row] = await db.select().from(machines).where(eq(machines.id, id));
    return row;
  }

  async updateMachine(id: number, data: Partial<Machine>): Promise<Machine> {
    const [row] = await db.update(machines).set(data).where(eq(machines.id, id)).returning();
    return row;
  }

  async seedMachines(): Promise<void> {
    const existing = await db.select().from(machines);
    if (existing.length > 0) return;

    const defaults = [
      { id: 1, name: "Barudan 8", heads: 8, stitchesPerMinute: 750, changeoverTimeMinutes: 3, isActive: true },
      { id: 2, name: "Barudan 6 1", heads: 6, stitchesPerMinute: 750, changeoverTimeMinutes: 3, isActive: true },
      { id: 3, name: "SWF 6 1", heads: 6, stitchesPerMinute: 750, changeoverTimeMinutes: 3, isActive: true },
      { id: 4, name: "SWF 6 2", heads: 6, stitchesPerMinute: 750, changeoverTimeMinutes: 3, isActive: true },
      { id: 5, name: "Barudan 6 2", heads: 6, stitchesPerMinute: 750, changeoverTimeMinutes: 3, isActive: true },
      { id: 6, name: "Print", heads: 1, stitchesPerMinute: 750, changeoverTimeMinutes: 3, isActive: true },
    ];

    for (const m of defaults) {
      await db.execute(sql`
        INSERT INTO machines (id, name, heads, stitches_per_minute, changeover_time_minutes, is_active)
        VALUES (${m.id}, ${m.name}, ${m.heads}, ${m.stitchesPerMinute}, ${m.changeoverTimeMinutes}, ${m.isActive})
        ON CONFLICT (id) DO NOTHING
      `);
    }
    // Reset the serial sequence so next auto-insert starts after 6
    await db.execute(sql`SELECT setval('machines_id_seq', 6, true)`);
  }

  // Idempotently make sure the dedicated "Print" machine (id 6) exists and is
  // assigned to operator Mollie as its default operator. Safe to call on every
  // boot — only fills gaps, never overwrites an existing operator choice.
  async ensurePrintMachine(): Promise<void> {
    const PRINT_ID = 6;
    const [mollie] = await db
      .select()
      .from(staff)
      .where(sql`lower(${staff.name}) = 'mollie'`);
    const mollieId = mollie?.id ?? null;

    const [existing] = await db.select().from(machines).where(eq(machines.id, PRINT_ID));
    if (!existing) {
      await db.execute(sql`
        INSERT INTO machines (id, name, heads, stitches_per_minute, changeover_time_minutes, is_active, default_operator_id)
        VALUES (${PRINT_ID}, 'Print', 1, 750, 3, true, ${mollieId})
        ON CONFLICT (id) DO NOTHING
      `);
      await db.execute(
        sql`SELECT setval('machines_id_seq', GREATEST((SELECT MAX(id) FROM machines), ${PRINT_ID}), true)`
      );
    } else {
      // Normalize an existing id-6 row so it is always the active "Print" machine,
      // and fill in Mollie as the default operator if one is not already set.
      const updates: Partial<Machine> = {};
      if (existing.name !== "Print") updates.name = "Print";
      if (!existing.isActive) updates.isActive = true;
      if (!existing.defaultOperatorId && mollieId) updates.defaultOperatorId = mollieId;
      if (Object.keys(updates).length > 0) {
        await db.update(machines).set(updates).where(eq(machines.id, PRINT_ID));
      }
    }
  }

  async getAppSetting(key: string): Promise<string | null> {
    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key));
    return row?.value ?? null;
  }

  async setAppSetting(key: string, value: string): Promise<void> {
    await db
      .insert(appSettings)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
  }

  // ── Message mark-as-unread ──────────────────────────────────────────────────

  async markJobMessageUnread(messageId: string, field: 'readByStaff' | 'readByCustomer'): Promise<void> {
    await db.update(jobMessages).set({ [field]: false }).where(eq(jobMessages.id, messageId));
  }

  async markConversationMessageUnread(messageId: string, field: 'readByStaff' | 'readByCustomer'): Promise<void> {
    await db.update(conversationMessages).set({ [field]: false }).where(eq(conversationMessages.id, messageId));
  }

  // ── Message reminders ────────────────────────────────────────────────────────

  async createMessageReminder(data: InsertMessageReminder): Promise<MessageReminder> {
    // Delete any existing reminder from this user for the same message before creating new one
    await db.delete(messageReminders).where(
      and(
        eq(messageReminders.messageId, data.messageId),
        eq(messageReminders.userId, data.userId),
        eq(messageReminders.userType, data.userType),
      )
    );
    const [row] = await db.insert(messageReminders).values(data).returning();
    return row;
  }

  async getMessageReminders(userId: string, userType: string): Promise<MessageReminder[]> {
    return db.select().from(messageReminders).where(
      and(
        eq(messageReminders.userId, userId),
        eq(messageReminders.userType, userType),
        eq(messageReminders.dismissed, false),
      )
    );
  }

  async dismissMessageReminder(id: string): Promise<void> {
    await db.update(messageReminders).set({ dismissed: true }).where(eq(messageReminders.id, id));
  }

  async deleteMessageReminder(id: string): Promise<void> {
    await db.delete(messageReminders).where(eq(messageReminders.id, id));
  }

  // ── Tasks ──────────────────────────────────────────────────────────────────

  async getTasks(filters?: { assignedToUserId?: string; status?: string }): Promise<Task[]> {
    let query = db.select().from(tasks).$dynamic();
    const conditions = [];
    if (filters?.assignedToUserId) conditions.push(eq(tasks.assignedToUserId, filters.assignedToUserId));
    if (filters?.status) conditions.push(eq(tasks.status, filters.status));
    if (conditions.length > 0) query = query.where(and(...conditions));
    return query.orderBy(desc(tasks.createdAt));
  }

  async getTask(id: number): Promise<Task | undefined> {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    return task;
  }

  async createTask(data: InsertTask): Promise<Task> {
    const [task] = await db.insert(tasks).values(data).returning();
    return task;
  }

  async updateTask(id: number, data: Partial<InsertTask & { completedAt: Date | null }>): Promise<Task> {
    const [task] = await db.update(tasks).set(data as any).where(eq(tasks.id, id)).returning();
    return task;
  }

  async deleteTask(id: number): Promise<void> {
    await db.delete(tasks).where(eq(tasks.id, id));
  }

  async getOpenTaskCount(): Promise<number> {
    const result = await db.select({ id: tasks.id }).from(tasks).where(
      and(eq(tasks.status, "open"), isNull(tasks.completedAt))
    );
    return result.length;
  }

  // Thread Colour Library
  async getThreadColours(): Promise<ThreadColour[]> {
    return db.select().from(threadColours).orderBy(threadColours.code);
  }

  async upsertThreadColours(colours: InsertThreadColour[]): Promise<void> {
    if (colours.length === 0) return;
    for (const colour of colours) {
      await db.insert(threadColours).values(colour).onConflictDoNothing();
    }
  }

  async clearThreadColours(): Promise<void> {
    await db.delete(threadColours);
  }

  // ===================== Casual / Summer Staff =====================

  async createCasualStaff(data: InsertCasualStaff): Promise<CasualStaff> {
    const [row] = await db.insert(casualStaff).values(data).returning();
    return row;
  }

  async getCasualStaffById(id: string): Promise<CasualStaff | undefined> {
    const [row] = await db.select().from(casualStaff).where(eq(casualStaff.id, id));
    return row;
  }

  async getCasualStaffByMobile(mobileNumber: string): Promise<CasualStaff | undefined> {
    const normalized = mobileNumber.replace(/\s+/g, "");
    const [row] = await db
      .select()
      .from(casualStaff)
      .where(sql`REPLACE(${casualStaff.mobileNumber}, ' ', '') = ${normalized}`);
    return row;
  }

  async listCasualStaff(): Promise<CasualStaff[]> {
    return db.select().from(casualStaff).orderBy(desc(casualStaff.createdAt));
  }

  async updateCasualStaff(
    id: string,
    updates: Partial<Pick<CasualStaff, "firstName" | "lastName" | "mobileNumber" | "pinHash" | "active" | "lastLoginAt" | "inviteSentAt" | "staffId">>
  ): Promise<CasualStaff> {
    const [row] = await db.update(casualStaff).set(updates).where(eq(casualStaff.id, id)).returning();
    return row;
  }

  async deleteCasualStaff(id: string): Promise<void> {
    await db.delete(casualStaff).where(eq(casualStaff.id, id));
  }

  async createCasualInviteToken(data: { casualStaffId: string; token: string; expiresAt: Date }): Promise<CasualStaffInviteToken> {
    const [row] = await db.insert(casualStaffInviteTokens).values(data).returning();
    return row;
  }

  async getCasualInviteToken(token: string): Promise<CasualStaffInviteToken | undefined> {
    const [row] = await db
      .select()
      .from(casualStaffInviteTokens)
      .where(eq(casualStaffInviteTokens.token, token));
    return row;
  }

  async markCasualInviteTokenUsed(id: string): Promise<void> {
    await db.update(casualStaffInviteTokens).set({ used: true }).where(eq(casualStaffInviteTokens.id, id));
  }

  // ===================== Shifts =====================

  async createShift(data: InsertShift & { status?: string }): Promise<Shift> {
    const [row] = await db.insert(shifts).values(data).returning();
    return row;
  }

  async createShiftsBulk(rows: Array<InsertShift & { status?: string }>): Promise<number> {
    if (rows.length === 0) return 0;
    const inserted = await db.insert(shifts).values(rows).returning({ id: shifts.id });
    return inserted.length;
  }

  async getShift(id: string): Promise<Shift | undefined> {
    const [row] = await db.select().from(shifts).where(eq(shifts.id, id));
    return row;
  }

  async listShifts(filters: { status?: string; machineId?: number; from?: Date; to?: Date } = {}): Promise<Shift[]> {
    const conds: any[] = [];
    if (filters.status) conds.push(eq(shifts.status, filters.status));
    if (filters.machineId != null) conds.push(eq(shifts.machineId, filters.machineId));
    if (filters.from) conds.push(gte(shifts.date, filters.from));
    if (filters.to) conds.push(lte(shifts.date, filters.to));
    const where = conds.length ? and(...conds) : undefined;
    return db.select().from(shifts).where(where as any).orderBy(shifts.date, shifts.startTime);
  }

  async getShiftsByMachineAndDate(machineId: number, date: Date): Promise<Shift[]> {
    const start = new Date(date); start.setHours(0, 0, 0, 0);
    const end = new Date(date); end.setHours(23, 59, 59, 999);
    return db
      .select()
      .from(shifts)
      .where(and(eq(shifts.machineId, machineId), gte(shifts.date, start), lte(shifts.date, end)))
      .orderBy(shifts.startTime);
  }

  async getShiftsClaimedBy(casualStaffId: string): Promise<Shift[]> {
    return db
      .select()
      .from(shifts)
      .where(and(eq(shifts.claimedById, casualStaffId), eq(shifts.status, "claimed")))
      .orderBy(shifts.date, shifts.startTime);
  }

  async updateShift(id: string, updates: Partial<Shift>): Promise<Shift> {
    const [row] = await db.update(shifts).set(updates).where(eq(shifts.id, id)).returning();
    return row;
  }

  // Atomically claim (optionally part of) an available shift. Runs inside a
  // transaction with a row lock so two staff can't claim the same window and the
  // weekly limit can't be exceeded by concurrent requests. Throws Error with a
  // `code` of UNAVAILABLE | PAST | OUT_OF_RANGE | TOO_SHORT | WEEKLY_LIMIT.
  async claimShiftAtomic(params: {
    shiftId: string;
    casualStaffId: string;
    start?: number;
    end?: number;
    weeklyLimit: number;
    weekFrom: Date;
    weekTo: Date;
    minMinutes: number;
    fragmentMinMinutes: number;
  }): Promise<Shift> {
    const fail = (code: string, message: string) => {
      const err: any = new Error(message);
      err.code = code;
      return err;
    };
    return db.transaction(async (tx) => {
      const [shift] = await tx
        .select()
        .from(shifts)
        .where(eq(shifts.id, params.shiftId))
        .for("update");
      if (!shift || shift.status !== "available") {
        throw fail("UNAVAILABLE", "Sorry, that shift is no longer available.");
      }
      // Re-check the reservation under the row lock so an offer can't be
      // bypassed by a concurrent claim (TOCTOU).
      if (shift.offeredToId && shift.offeredToId !== params.casualStaffId) {
        throw fail("RESERVED", "This shift is reserved for someone else.");
      }

      const dayStart = new Date(shift.date); dayStart.setHours(0, 0, 0, 0);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      if (dayStart < today) throw fail("PAST", "That shift is in the past.");

      const s = params.start ?? shift.startTime;
      const e = params.end ?? shift.endTime;
      const flex = shift.startFlexMinutes ?? 0;
      const isFlex = flex > 0;
      if (isFlex) {
        // Flexible-start shift: the start may slide up to `flex` minutes either
        // way and the duration is fixed, so the end slides with it. No leftover
        // window is split off for others.
        const duration = shift.endTime - shift.startTime;
        if (e <= s) {
          throw fail("OUT_OF_RANGE", "Pick a valid start time.");
        }
        if (e - s !== duration) {
          throw fail("OUT_OF_RANGE", "This shift has a fixed length — only the start time can change.");
        }
        if (s < shift.startTime - flex || s > shift.startTime + flex || s < 0 || e > 1440) {
          throw fail("OUT_OF_RANGE", "Start time is outside the allowed range.");
        }
      } else if (e <= s || s < shift.startTime || e > shift.endTime) {
        throw fail("OUT_OF_RANGE", "Pick a time inside the shift window.");
      }
      if (e - s < params.minMinutes) {
        throw fail("TOO_SHORT", `Shifts must be at least ${params.minMinutes} minutes.`);
      }

      const claimedRows = await tx
        .select({ id: shifts.id })
        .from(shifts)
        .where(and(
          eq(shifts.claimedById, params.casualStaffId),
          eq(shifts.status, "claimed"),
          gte(shifts.date, params.weekFrom),
          lte(shifts.date, params.weekTo),
        ));
      if (claimedRows.length >= params.weeklyLimit) {
        throw fail("WEEKLY_LIMIT", `You can only book ${params.weeklyLimit} shifts per week.`);
      }

      const [claimed] = await tx
        .update(shifts)
        .set({ startTime: s, endTime: e, status: "claimed", claimedById: params.casualStaffId, claimedAt: new Date() })
        .where(and(eq(shifts.id, params.shiftId), eq(shifts.status, "available")))
        .returning();
      if (!claimed) throw fail("UNAVAILABLE", "Sorry, that shift is no longer available.");

      // Flexible-start shifts keep a fixed length and slide as a whole, so there
      // is never a leftover window to hand back to others.
      const fragments: Array<InsertShift & { status?: string }> = [];
      if (!isFlex) {
        if (s - shift.startTime >= params.fragmentMinMinutes) {
          fragments.push({ machineId: shift.machineId, date: dayStart, startTime: shift.startTime, endTime: s, status: "available" });
        }
        if (shift.endTime - e >= params.fragmentMinMinutes) {
          fragments.push({ machineId: shift.machineId, date: dayStart, startTime: e, endTime: shift.endTime, status: "available" });
        }
      }
      if (fragments.length) await tx.insert(shifts).values(fragments);

      return claimed;
    });
  }

  async deleteShift(id: string): Promise<void> {
    await db.delete(shifts).where(eq(shifts.id, id));
  }

  // Merge contiguous/overlapping AVAILABLE shift rows for one machine+date into
  // the fewest rows. Runs in a transaction with row locks and only ever touches
  // rows that are still 'available', so a concurrent claim can't have a freshly
  // claimed row deleted out from under it.
  async mergeAvailableShiftsAtomic(machineId: number, date: Date): Promise<void> {
    const start = new Date(date); start.setHours(0, 0, 0, 0);
    const end = new Date(date); end.setHours(23, 59, 59, 999);
    const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
    await db.transaction(async (tx) => {
      const available = (await tx
        .select()
        .from(shifts)
        .where(and(eq(shifts.machineId, machineId), eq(shifts.status, "available"), gte(shifts.date, start), lte(shifts.date, end)))
        .for("update"))
        .sort((a, b) => a.startTime - b.startTime);
      if (available.length < 2) return;

      const merged: Array<{ startTime: number; endTime: number }> = [];
      let current = { startTime: available[0].startTime, endTime: available[0].endTime };
      for (let i = 1; i < available.length; i++) {
        const next = available[i];
        if (next.startTime <= current.endTime) {
          current.endTime = Math.max(current.endTime, next.endTime);
        } else {
          merged.push({ ...current });
          current = { startTime: next.startTime, endTime: next.endTime };
        }
      }
      merged.push({ ...current });
      if (merged.length === available.length) return;

      await tx.delete(shifts).where(and(
        inArray(shifts.id, available.map((s) => s.id)),
        eq(shifts.status, "available"),
      ));
      await tx.insert(shifts).values(merged.map((m) => ({
        machineId,
        date: dayStart,
        startTime: m.startTime,
        endTime: m.endTime,
        status: "available",
      })));
    });
  }

  async deleteSuggestedShifts(): Promise<void> {
    await db.delete(shifts).where(eq(shifts.status, "suggested"));
  }

  async publishShifts(ids?: string[]): Promise<number> {
    const cond = ids && ids.length
      ? and(eq(shifts.status, "suggested"), inArray(shifts.id, ids))
      : eq(shifts.status, "suggested");
    const updated = await db.update(shifts).set({ status: "available" }).where(cond as any).returning({ id: shifts.id });
    return updated.length;
  }

  async getCasualHours(from: Date, to: Date): Promise<Array<{ casualStaffId: string; minutes: number; shiftCount: number }>> {
    const rows = await db
      .select()
      .from(shifts)
      .where(and(
        eq(shifts.status, "claimed"),
        isNotNull(shifts.claimedById),
        gte(shifts.date, from),
        lte(shifts.date, to),
      ));
    const totals = new Map<string, { minutes: number; shiftCount: number }>();
    for (const s of rows) {
      if (!s.claimedById) continue;
      const cur = totals.get(s.claimedById) ?? { minutes: 0, shiftCount: 0 };
      cur.minutes += Math.max(0, s.endTime - s.startTime);
      cur.shiftCount += 1;
      totals.set(s.claimedById, cur);
    }
    return Array.from(totals.entries()).map(([casualStaffId, v]) => ({ casualStaffId, ...v }));
  }

  async countClaimedShiftsInRange(casualStaffId: string, from: Date, to: Date): Promise<number> {
    const rows = await db
      .select({ id: shifts.id })
      .from(shifts)
      .where(and(
        eq(shifts.claimedById, casualStaffId),
        eq(shifts.status, "claimed"),
        gte(shifts.date, from),
        lte(shifts.date, to),
      ));
    return rows.length;
  }

}

export const storage = new DatabaseStorage();
