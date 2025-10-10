import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, index, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table for Replit Auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const customers = pgTable("customers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  contactName: text("contact_name"),
  email: text("email"),
  telephone: text("telephone"),
  address: text("address"),
});

export const staff = pgTable("staff", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
});

export const jobs = pgTable("jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  jobName: text("job_name").notNull(),
  poNumber: text("po_number"),
  logoApproved: boolean("logo_approved").notNull().default(false),
  quantity: integer("quantity").notNull(),
  stitchCount: integer("stitch_count").notNull(),
  dateReceived: timestamp("date_received").notNull(),
  requiredDispatchDate: timestamp("required_dispatch_date").notNull(),
  completed: boolean("completed").notNull().default(false),
  completedOnTime: boolean("completed_on_time"),
  completedById: varchar("completed_by_id").references(() => staff.id),
  machineId: integer("machine_id"),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
});

export const staffShifts = pgTable("staff_shifts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  staffId: varchar("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  date: timestamp("date").notNull(),
  startTime: integer("start_time").notNull(),
  endTime: integer("end_time").notNull(),
  isRecurring: boolean("is_recurring").notNull().default(false),
  recurringDayOfWeek: integer("recurring_day_of_week"),
});

export const machineScheduleBlocks = pgTable("machine_schedule_blocks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  machineId: integer("machine_id").notNull(),
  date: timestamp("date").notNull(),
  startTime: integer("start_time").notNull(),
  endTime: integer("end_time").notNull(),
  blockType: text("block_type").notNull(),
  jobId: varchar("job_id").references(() => jobs.id, { onDelete: "cascade" }),
  notes: text("notes"),
});

export const jobSchedule = pgTable("job_schedule", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  machineId: integer("machine_id").notNull(),
  staffId: varchar("staff_id").notNull().references(() => staff.id),
  scheduledDate: timestamp("scheduled_date").notNull(),
  startTime: integer("start_time").notNull(),
  endTime: integer("end_time").notNull(),
  status: text("status").notNull().default("scheduled"),
});

export const jobLineItems = pgTable("job_line_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull(),
  description: text("description"),
});

export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
});

export const updateCustomerSchema = z.object({
  name: z.string().optional(),
  contactName: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  telephone: z.string().optional(),
  address: z.string().optional(),
});

export const insertStaffSchema = createInsertSchema(staff).omit({
  id: true,
});

export const updateStaffSchema = z.object({
  name: z.string().optional(),
});

export const insertJobSchema = createInsertSchema(jobs).omit({
  id: true,
}).extend({
  poNumber: z.preprocess(
    (val) => val === "" ? null : val,
    z.string().nullable().optional()
  ),
  dateReceived: z.string(),
  requiredDispatchDate: z.string(),
  machineId: z.preprocess(
    (val) => {
      if (val === null || val === undefined || val === "") return null;
      if (typeof val === "string") return parseInt(val, 10);
      return val;
    },
    z.union([z.number().int().min(1).max(4), z.null()])
  ),
});

export const updateJobSchema = z.object({
  customerId: z.string().optional(),
  jobName: z.string().optional(),
  poNumber: z.preprocess(
    (val) => val === "" ? null : val,
    z.string().nullable().optional()
  ),
  logoApproved: z.coerce.boolean().optional(),
  quantity: z.coerce.number().optional(),
  stitchCount: z.coerce.number().optional(),
  dateReceived: z.preprocess(
    (val) => val ? new Date(val as string) : undefined,
    z.date().optional()
  ),
  requiredDispatchDate: z.preprocess(
    (val) => val ? new Date(val as string) : undefined,
    z.date().optional()
  ),
  completed: z.coerce.boolean().optional(),
  completedOnTime: z.coerce.boolean().nullable().optional(),
  machineId: z.preprocess(
    (val) => {
      // Keep undefined as undefined so it doesn't overwrite existing values
      if (val === undefined) return undefined;
      // Convert null or empty string to null
      if (val === null || val === "") return null;
      // Convert string numbers to actual numbers
      if (typeof val === "string") return parseInt(val, 10);
      return val;
    },
    z.union([z.number().int().min(1).max(4), z.null()]).optional()
  ),
  status: z.string().optional(),
  notes: z.string().optional(),
  completedById: z.preprocess(
    (val) => val === "" ? null : val,
    z.string().nullable().optional()
  ),
});

export const insertStaffShiftSchema = createInsertSchema(staffShifts).omit({
  id: true,
}).extend({
  date: z.string(),
  startTime: z.number().int().min(0).max(1440),
  endTime: z.number().int().min(0).max(1440),
  isRecurring: z.boolean().default(false),
  recurringDayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
}).refine(
  (data) => data.endTime > data.startTime,
  { message: "End time must be after start time" }
).refine(
  (data) => !data.isRecurring || (data.recurringDayOfWeek !== null && data.recurringDayOfWeek !== undefined),
  { message: "Recurring day of week is required for recurring shifts" }
);

export const insertMachineScheduleBlockSchema = createInsertSchema(machineScheduleBlocks).omit({
  id: true,
}).extend({
  date: z.string(),
  machineId: z.number().int().min(1).max(4),
  startTime: z.number().int().min(0).max(1440),
  endTime: z.number().int().min(0).max(1440),
  blockType: z.enum(["job", "maintenance", "blocked"]),
  jobId: z.string().nullable().optional(),
}).refine(
  (data) => data.endTime > data.startTime,
  { message: "End time must be after start time" }
);

export const insertJobScheduleSchema = createInsertSchema(jobSchedule).omit({
  id: true,
}).extend({
  scheduledDate: z.string(),
  machineId: z.number().int().min(1).max(4),
  startTime: z.number().int().min(0).max(1440),
  endTime: z.number().int().min(0).max(1440),
  status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]).default("scheduled"),
}).refine(
  (data) => data.endTime > data.startTime,
  { message: "End time must be after start time" }
);

export const updateStaffShiftSchema = z.object({
  staffId: z.string().optional(),
  date: z.preprocess(
    (val) => val ? new Date(val as string) : undefined,
    z.date().optional()
  ),
  startTime: z.number().int().min(0).max(1440).optional(),
  endTime: z.number().int().min(0).max(1440).optional(),
  isRecurring: z.boolean().optional(),
  recurringDayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
}).refine(
  (data) => {
    if (data.startTime !== undefined && data.endTime !== undefined) {
      return data.endTime > data.startTime;
    }
    return true;
  },
  { message: "End time must be after start time" }
).refine(
  (data) => {
    if (data.isRecurring === true) {
      return data.recurringDayOfWeek !== null && data.recurringDayOfWeek !== undefined;
    }
    return true;
  },
  { message: "Recurring day of week is required for recurring shifts" }
);

export const updateMachineScheduleBlockSchema = z.object({
  machineId: z.number().int().min(1).max(4).optional(),
  date: z.preprocess(
    (val) => val ? new Date(val as string) : undefined,
    z.date().optional()
  ),
  startTime: z.number().int().min(0).max(1440).optional(),
  endTime: z.number().int().min(0).max(1440).optional(),
  blockType: z.enum(["job", "maintenance", "blocked"]).optional(),
  jobId: z.string().nullable().optional(),
  notes: z.string().optional(),
}).refine(
  (data) => {
    if (data.startTime !== undefined && data.endTime !== undefined) {
      return data.endTime > data.startTime;
    }
    return true;
  },
  { message: "End time must be after start time" }
);

export const updateJobScheduleSchema = z.object({
  jobId: z.string().optional(),
  machineId: z.number().int().min(1).max(4).optional(),
  staffId: z.string().optional(),
  scheduledDate: z.preprocess(
    (val) => val ? new Date(val as string) : undefined,
    z.date().optional()
  ),
  startTime: z.number().int().min(0).max(1440).optional(),
  endTime: z.number().int().min(0).max(1440).optional(),
  status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]).optional(),
}).refine(
  (data) => {
    if (data.startTime !== undefined && data.endTime !== undefined) {
      return data.endTime > data.startTime;
    }
    return true;
  },
  { message: "End time must be after start time" }
);

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customers.$inferSelect;
export type InsertStaff = z.infer<typeof insertStaffSchema>;
export type Staff = typeof staff.$inferSelect;
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobs.$inferSelect;
export type InsertStaffShift = z.infer<typeof insertStaffShiftSchema>;
export type StaffShift = typeof staffShifts.$inferSelect;
export type InsertMachineScheduleBlock = z.infer<typeof insertMachineScheduleBlockSchema>;
export type MachineScheduleBlock = typeof machineScheduleBlocks.$inferSelect;
export type InsertJobSchedule = z.infer<typeof insertJobScheduleSchema>;
export type JobSchedule = typeof jobSchedule.$inferSelect;

export const insertJobLineItemSchema = createInsertSchema(jobLineItems).omit({
  id: true,
});

export type InsertJobLineItem = z.infer<typeof insertJobLineItemSchema>;
export type JobLineItem = typeof jobLineItems.$inferSelect;
