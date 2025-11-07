import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, index, jsonb, real } from "drizzle-orm/pg-core";
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

// User storage table for staff authentication
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: varchar("username").unique(),
  email: varchar("email").unique().notNull(),
  password: varchar("password"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role").notNull().default("staff"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const customers = pgTable("customers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  contactFirstName: text("contact_first_name"),
  contactLastName: text("contact_last_name"),
  email: text("email"),
  telephone: text("telephone"),
  address: text("address"),
  pricingTable2025: boolean("pricing_table_2025").notNull().default(false),
  pricingTable2026: boolean("pricing_table_2026").notNull().default(false),
  active: boolean("active").notNull().default(true),
});

export const staff = pgTable("staff", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  email: text("email"),
  telephone: text("telephone"),
  userId: varchar("user_id").references(() => users.id),
});

export const jobs = pgTable("jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobNumber: integer("job_number").unique(),
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  jobName: text("job_name").notNull(),
  poNumber: text("po_number"),
  quantity: integer("quantity").notNull(),
  goodsReceived: timestamp("goods_received"),
  requiredDispatchDate: timestamp("required_dispatch_date"),
  completed: boolean("completed").notNull().default(false),
  completedOnTime: boolean("completed_on_time"),
  completedById: varchar("completed_by_id").references(() => staff.id),
  machineId: integer("machine_id"),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  invoiceStatus: varchar("invoice_status").notNull().default("pending"),
  invoicedAt: timestamp("invoiced_at"),
  invoiceReference: text("invoice_reference"),
  shippingMethod: text("shipping_method"),
  dhlTrackingNumber: text("dhl_tracking_number"),
  packageCount: integer("package_count"),
  packageType: text("package_type"),
  shippingCost: text("shipping_cost"),
  consolidatedShipmentId: varchar("consolidated_shipment_id"),
  deliveryAddressType: text("delivery_address_type").default("customer"),
  deliveryAddress: text("delivery_address"),
  actualProductionTime: real("actual_production_time"),
});

export const staffShifts = pgTable("staff_shifts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  staffId: varchar("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  date: timestamp("date").notNull(),
  startTime: integer("start_time").notNull(),
  endTime: integer("end_time").notNull(),
  isRecurring: boolean("is_recurring").notNull().default(false),
  recurringDaysOfWeek: integer("recurring_days_of_week").array(),
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
  jobType: text("job_type").notNull().default("Embroidery"),
  quantity: integer("quantity").notNull(),
  description: text("description"),
  stitchCount: integer("stitch_count").notNull(),
  logoApproved: boolean("logo_approved").notNull().default(false),
  completed: boolean("completed").notNull().default(false),
  completedById: varchar("completed_by_id").references(() => staff.id),
  completedAt: timestamp("completed_at"),
  machineId: integer("machine_id"),
});

export const staffMachineAllocations = pgTable("staff_machine_allocations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  staffId: varchar("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  machineId: integer("machine_id").notNull(),
  date: timestamp("date").notNull(),
  startTime: integer("start_time").notNull(),
  endTime: integer("end_time").notNull(),
  isRecurring: boolean("is_recurring").notNull().default(false),
  recurringDaysOfWeek: integer("recurring_days_of_week").array(),
});

export const userStars = pgTable("user_stars", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  yellowStars: integer("yellow_stars").notNull().default(0),
  redStars: integer("red_stars").notNull().default(0),
});

export const logoSetups = pgTable("logo_setups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  jobName: text("job_name").notNull(),
  approved: boolean("approved").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  approvedAt: timestamp("approved_at"),
  notes: text("notes"),
});

// Customer portal: customer user accounts
export const customerUsers = pgTable("customer_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  email: varchar("email").notNull().unique(),
  passwordHash: varchar("password_hash").notNull(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  mustResetPassword: boolean("must_reset_password").notNull().default(true),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at"),
});

// Password reset tokens for staff
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: varchar("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  used: boolean("used").notNull().default(false),
});

// Customer portal: job messages (chat)
export const jobMessages = pgTable("job_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  senderType: varchar("sender_type").notNull(), // 'customer' or 'staff'
  senderId: varchar("sender_id").notNull(), // customerUserId or userId
  message: text("message").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  readByStaff: boolean("read_by_staff").notNull().default(false),
  readByCustomer: boolean("read_by_customer").notNull().default(false),
});

// Customer portal: job file uploads
export const jobFiles = pgTable("job_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  fileName: varchar("file_name").notNull(),
  fileUrl: varchar("file_url").notNull(),
  fileSize: integer("file_size").notNull(),
  fileType: varchar("file_type").notNull(),
  uploadedBy: varchar("uploaded_by").notNull(), // 'customer' or 'staff'
  uploaderId: varchar("uploader_id").notNull(), // customerUserId or userId
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
});

export const updateCustomerSchema = z.object({
  name: z.string().optional(),
  contactFirstName: z.string().optional(),
  contactLastName: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  telephone: z.string().optional(),
  address: z.string().optional(),
  pricingTable2025: z.boolean().optional(),
  pricingTable2026: z.boolean().optional(),
  active: z.boolean().optional(),
});

export const insertStaffSchema = createInsertSchema(staff).omit({
  id: true,
});

export const updateStaffSchema = z.object({
  name: z.string().optional(),
});

export const insertJobSchema = createInsertSchema(jobs).omit({
  id: true,
  jobNumber: true,
}).extend({
  poNumber: z.preprocess(
    (val) => val === "" ? null : val,
    z.string().nullable().optional()
  ),
  goodsReceived: z.preprocess(
    (val) => val === "" ? null : val,
    z.union([z.string(), z.null()])
  ),
  requiredDispatchDate: z.preprocess(
    (val) => val === "" ? null : val,
    z.union([z.string(), z.null()])
  ),
  machineId: z.preprocess(
    (val) => {
      if (val === null || val === undefined || val === "") return null;
      if (typeof val === "string") return parseInt(val, 10);
      return val;
    },
    z.union([z.number().int().min(1).max(4), z.null()])
  ),
  quantity: z.coerce.number().int().min(0),
});

export const updateJobSchema = z.object({
  customerId: z.string().optional(),
  jobName: z.string().optional(),
  poNumber: z.preprocess(
    (val) => val === "" ? null : val,
    z.string().nullable().optional()
  ),
  quantity: z.coerce.number().int().min(0).optional(),
  goodsReceived: z.preprocess(
    (val) => {
      if (val === "" || val === null) return null;
      if (val) return new Date(val as string);
      return undefined;
    },
    z.union([z.date(), z.null()]).optional()
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
  invoiceStatus: z.string().optional(),
  shippingMethod: z.preprocess(
    (val) => val === "" ? null : val,
    z.string().nullable().optional()
  ),
  dhlTrackingNumber: z.preprocess(
    (val) => val === "" ? null : val,
    z.string().nullable().optional()
  ),
  packageCount: z.preprocess(
    (val) => {
      if (val === "" || val === null || val === undefined) return null;
      if (typeof val === "string") return parseInt(val, 10);
      return val;
    },
    z.number().int().min(1).nullable().optional()
  ),
  packageType: z.preprocess(
    (val) => val === "" ? null : val,
    z.string().nullable().optional()
  ),
  shippingCost: z.preprocess(
    (val) => val === "" ? null : val,
    z.string().nullable().optional()
  ),
  consolidatedShipmentId: z.preprocess(
    (val) => val === "" ? null : val,
    z.string().nullable().optional()
  ),
  actualProductionTime: z.preprocess(
    (val) => {
      if (val === "" || val === null || val === undefined) return null;
      if (typeof val === "string") return parseFloat(val);
      return val;
    },
    z.number().min(0).nullable().optional()
  ),
  // This is not a database field - used to specify which jobs to consolidate together
  consolidatedJobIds: z.array(z.string()).optional(),
});

export const insertStaffShiftSchema = createInsertSchema(staffShifts).omit({
  id: true,
}).extend({
  date: z.string(),
  startTime: z.number().int().min(0).max(1440),
  endTime: z.number().int().min(0).max(1440),
  isRecurring: z.boolean().default(false),
  recurringDaysOfWeek: z.array(z.number().int().min(0).max(6)).nullable().optional(),
}).refine(
  (data) => data.endTime > data.startTime,
  { message: "End time must be after start time" }
).refine(
  (data) => {
    if (data.isRecurring) {
      return data.recurringDaysOfWeek && data.recurringDaysOfWeek.length > 0;
    }
    return true;
  },
  { message: "At least one day must be selected for recurring shifts" }
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
  recurringDaysOfWeek: z.array(z.number().int().min(0).max(6)).nullable().optional(),
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
      return data.recurringDaysOfWeek && data.recurringDaysOfWeek.length > 0;
    }
    return true;
  },
  { message: "At least one day must be selected for recurring shifts" }
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

// User roles
export const UserRole = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  MANAGER: "manager",
  STAFF: "staff",
} as const;

export type UserRoleType = typeof UserRole[keyof typeof UserRole];

// Helper function to check if a user can view prices
export function canViewPrices(userRole: string | undefined): boolean {
  return userRole === UserRole.SUPER_ADMIN || userRole === UserRole.ADMIN || userRole === UserRole.MANAGER;
}

// Helper function to check if a user is a super admin
export function isSuperAdmin(userRole: string | undefined): boolean {
  return userRole === UserRole.SUPER_ADMIN;
}
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
}).extend({
  quantity: z.coerce.number().int().min(0),
  stitchCount: z.coerce.number().int().min(0),
  logoApproved: z.preprocess(
    (val) => val === true || val === 'true' || val === 1 || val === '1',
    z.boolean()
  ).default(false),
  completed: z.coerce.boolean().default(false),
  description: z.string().nullable().optional(),
  completedById: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  machineId: z.preprocess(
    (val) => {
      if (val === null || val === undefined || val === "") return null;
      if (typeof val === "string") return parseInt(val, 10);
      return val;
    },
    z.union([z.number().int().min(1).max(4), z.null()])
  ).optional(),
});

export const updateJobLineItemSchema = z.object({
  quantity: z.coerce.number().int().min(0).optional(),
  description: z.string().nullable().optional(),
  stitchCount: z.coerce.number().int().min(0).optional(),
  logoApproved: z.coerce.boolean().optional(),
  completed: z.coerce.boolean().optional(),
  completedById: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  machineId: z.preprocess(
    (val) => {
      if (val === undefined) return undefined;
      if (val === null || val === "") return null;
      if (typeof val === "string") return parseInt(val, 10);
      return val;
    },
    z.union([z.number().int().min(1).max(4), z.null()]).optional()
  ),
});

export type InsertJobLineItem = z.infer<typeof insertJobLineItemSchema>;
export type JobLineItem = typeof jobLineItems.$inferSelect;

export type JobWithLineItems = Job & {
  lineItems: JobLineItem[];
};

export const insertStaffMachineAllocationSchema = createInsertSchema(staffMachineAllocations).omit({
  id: true,
}).extend({
  date: z.string(),
  machineId: z.number().int().min(1).max(4),
  startTime: z.number().int().min(0).max(1440),
  endTime: z.number().int().min(0).max(1440),
  isRecurring: z.boolean().default(false),
  recurringDaysOfWeek: z.array(z.number().int().min(0).max(6)).nullable().optional(),
}).refine(
  (data) => data.endTime > data.startTime,
  { message: "End time must be after start time" }
).refine(
  (data) => {
    if (data.isRecurring) {
      return data.recurringDaysOfWeek && data.recurringDaysOfWeek.length > 0;
    }
    return true;
  },
  { message: "At least one day must be selected for recurring allocations" }
);

export const updateStaffMachineAllocationSchema = z.object({
  staffId: z.string().optional(),
  machineId: z.number().int().min(1).max(4).optional(),
  date: z.preprocess(
    (val) => val ? new Date(val as string) : undefined,
    z.date().optional()
  ),
  startTime: z.number().int().min(0).max(1440).optional(),
  endTime: z.number().int().min(0).max(1440).optional(),
  isRecurring: z.boolean().optional(),
  recurringDaysOfWeek: z.array(z.number().int().min(0).max(6)).nullable().optional(),
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
      return data.recurringDaysOfWeek && data.recurringDaysOfWeek.length > 0;
    }
    return true;
  },
  { message: "At least one day must be selected for recurring allocations" }
);

export type InsertStaffMachineAllocation = z.infer<typeof insertStaffMachineAllocationSchema>;
export type StaffMachineAllocation = typeof staffMachineAllocations.$inferSelect;

export const insertLogoSetupSchema = createInsertSchema(logoSetups).omit({
  id: true,
  createdAt: true,
  approvedAt: true,
}).extend({
  jobName: z.string().min(1, "Job name is required"),
  customerId: z.string().min(1, "Customer is required"),
  notes: z.string().optional(),
});

export const updateLogoSetupSchema = z.object({
  jobName: z.string().optional(),
  approved: z.boolean().optional(),
  approvedAt: z.preprocess(
    (val) => val ? new Date(val as string) : undefined,
    z.date().optional()
  ),
  notes: z.string().optional(),
});

export type InsertLogoSetup = z.infer<typeof insertLogoSetupSchema>;
export type LogoSetup = typeof logoSetups.$inferSelect;

// Customer portal schemas
export const insertCustomerUserSchema = createInsertSchema(customerUsers).omit({
  id: true,
  passwordHash: true,
  createdAt: true,
  lastLoginAt: true,
}).extend({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
});

export const customerLoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const insertJobMessageSchema = createInsertSchema(jobMessages).omit({
  id: true,
  createdAt: true,
}).extend({
  message: z.string().min(1, "Message cannot be empty"),
  senderType: z.enum(["customer", "staff"]),
});

export const insertJobFileSchema = createInsertSchema(jobFiles).omit({
  id: true,
  createdAt: true,
}).extend({
  fileName: z.string().min(1),
  fileUrl: z.string().url(),
  fileSize: z.number().int().positive(),
  fileType: z.string().min(1),
  uploadedBy: z.enum(["customer", "staff"]),
});

export type InsertCustomerUser = z.infer<typeof insertCustomerUserSchema>;
export type CustomerUser = typeof customerUsers.$inferSelect;
export type CustomerLogin = z.infer<typeof customerLoginSchema>;
export type InsertJobMessage = z.infer<typeof insertJobMessageSchema>;
export type JobMessage = typeof jobMessages.$inferSelect;
export type InsertJobFile = z.infer<typeof insertJobFileSchema>;
export type JobFile = typeof jobFiles.$inferSelect;

// Staff authentication schemas
export const staffLoginSchema = z.object({
  email: z.string().min(1, "Username or email is required"),
  password: z.string().min(1, "Password is required"),
});

export const staffRegisterSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  role: z.enum(["super_admin", "admin", "manager", "staff"]).default("staff"),
});

export const updateUserSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters").optional(),
  email: z.string().email("Invalid email address").optional(),
  firstName: z.string().min(1, "First name is required").optional(),
  lastName: z.string().min(1, "Last name is required").optional(),
});

export type StaffLogin = z.infer<typeof staffLoginSchema>;
export type StaffRegister = z.infer<typeof staffRegisterSchema>;
export type UpdateUser = z.infer<typeof updateUserSchema>;

// Password reset schemas
export const passwordResetRequestSchema = z.object({
  email: z.string().email(),
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>;
export type PasswordResetConfirm = z.infer<typeof passwordResetConfirmSchema>;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
