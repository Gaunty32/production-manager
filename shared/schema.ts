import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, serial, timestamp, boolean, index, jsonb, real } from "drizzle-orm/pg-core";
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
  active: boolean("active").notNull().default(true),
  emailNotificationsMessages: boolean("email_notifications_messages").notNull().default(false),
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
  logoUrl: text("logo_url"),
  pricingTable2025: boolean("pricing_table_2025").notNull().default(false),
  pricingTable2026: boolean("pricing_table_2026").notNull().default(false),
  active: boolean("active").notNull().default(true),
  xeroContactId: text("xero_contact_id"),
  createdAt: timestamp("created_at").defaultNow(),
  lastReEngagementEmailAt: timestamp("last_re_engagement_email_at"),
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
  status: text("status").notNull().default("production"), // pending_customer_approval, production, completed
  notes: text("notes"),
  invoiceStatus: varchar("invoice_status").notNull().default("pending"),
  invoicedAt: timestamp("invoiced_at"),
  invoiceReference: text("invoice_reference"),
  invoiceTotal: real("invoice_total"), // Total invoice amount (excluding VAT)
  shippingMethod: text("shipping_method"),
  dhlTrackingNumber: text("dhl_tracking_number"),
  packageCount: integer("package_count"),
  packageType: text("package_type"),
  shippingCost: text("shipping_cost"),
  consolidatedShipmentId: varchar("consolidated_shipment_id"),
  deliveryAddressType: text("delivery_address_type").default("customer"),
  deliveryAddress: text("delivery_address"),
  actualProductionTime: real("actual_production_time"),
  submittedById: varchar("submitted_by_id").references(() => customerUsers.id),
  submittedAt: timestamp("submitted_at"),
  approvedById: varchar("approved_by_id").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  rejectedById: varchar("rejected_by_id").references(() => users.id),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  conversationArchivedByCustomer: boolean("conversation_archived_by_customer").notNull().default(false),
  conversationArchivedByStaff: boolean("conversation_archived_by_staff").notNull().default(false),
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
  lineItemId: varchar("line_item_id").references(() => jobLineItems.id, { onDelete: "cascade" }),
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
  position: text("position"),
  positionOther: text("position_other"),
  quantity: integer("quantity").notNull(),
  description: text("description"),
  stitchCount: integer("stitch_count").notNull(),
  logoApproved: boolean("logo_approved").notNull().default(false),
  completed: boolean("completed").notNull().default(false),
  completedById: varchar("completed_by_id").references(() => staff.id),
  completedAt: timestamp("completed_at"),
  machineId: integer("machine_id"),
  actualProductionTimeMinutes: integer("actual_production_time_minutes"),
});

// Production entries for tracking partial daily work on line items
export const productionEntries = pgTable("production_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  lineItemId: varchar("line_item_id").notNull().references(() => jobLineItems.id, { onDelete: "cascade" }),
  staffId: varchar("staff_id").notNull().references(() => staff.id),
  machineId: integer("machine_id"),
  workDate: timestamp("work_date").notNull(), // The date the work was performed
  quantityCompleted: integer("quantity_completed").notNull(), // Items completed in this session
  productionTimeMinutes: integer("production_time_minutes").notNull(), // Time spent in this session
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
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

export const staffHolidays = pgTable("staff_holidays", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  staffId: varchar("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  holidayType: text("holiday_type").notNull().default("holiday"), // holiday, sick, other
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const bankHolidays = pgTable("bank_holidays", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  date: timestamp("date").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
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
  invoicedAt: timestamp("invoiced_at"),
  invoiceReference: varchar("invoice_reference"),
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
  profileImageUrl: varchar("profile_image_url"),
  mustResetPassword: boolean("must_reset_password").notNull().default(true),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at"),
  inviteSentAt: timestamp("invite_sent_at"),
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

// One-time invite/reset tokens for customer portal users
export const customerInviteTokens = pgTable("customer_invite_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerUserId: varchar("customer_user_id").notNull().references(() => customerUsers.id, { onDelete: "cascade" }),
  token: varchar("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  used: boolean("used").notNull().default(false),
});

// Customer impersonation sessions for staff "view as customer" feature
export const impersonationSessions = pgTable("impersonation_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tokenHash: varchar("token_hash").notNull().unique(),
  staffUserId: varchar("staff_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  customerUserId: varchar("customer_user_id").notNull().references(() => customerUsers.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  active: boolean("active").notNull().default(true),
}, (table) => [
  index("impersonation_sessions_staff_active_idx").on(table.staffUserId, table.active),
  index("impersonation_sessions_customer_active_idx").on(table.customerUserId, table.active),
]);

// Customer portal: job messages (chat)
export const jobMessages = pgTable("job_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").references(() => jobs.id, { onDelete: "set null" }),
  senderType: varchar("sender_type").notNull(), // 'customer' or 'staff'
  senderId: varchar("sender_id").notNull(), // customerUserId or userId
  message: text("message").notNull(),
  imageUrl: varchar("image_url"), // optional: object-storage path for a sample image
  isInternal: boolean("is_internal").notNull().default(false), // staff-only message, hidden from customer
  createdAt: timestamp("created_at").notNull().defaultNow(),
  readByStaff: boolean("read_by_staff").notNull().default(false),
  readByCustomer: boolean("read_by_customer").notNull().default(false),
  deleted: boolean("deleted").notNull().default(false),
  editedAt: timestamp("edited_at"),
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

// Direct conversations - not tied to a specific job
export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").references(() => customers.id, { onDelete: "cascade" }), // null when staffRecipientId is set
  staffRecipientId: varchar("staff_recipient_id").references(() => staff.id, { onDelete: "cascade" }), // null when customerId is set
  subject: varchar("subject").notNull(),
  status: varchar("status").notNull().default("open"), // 'open' | 'archived'
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const conversationMessages = pgTable("conversation_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  senderType: varchar("sender_type").notNull(), // 'customer' | 'staff'
  senderId: varchar("sender_id").notNull(),
  message: text("message").notNull(),
  imageUrl: varchar("image_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  readByStaff: boolean("read_by_staff").notNull().default(false),
  readByCustomer: boolean("read_by_customer").notNull().default(false),
});

// Samples - staff upload samples for customer approval
export const samples = pgTable("samples", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  jobId: varchar("job_id").references(() => jobs.id, { onDelete: "set null" }), // optional link to a job
  title: varchar("title").notNull(),
  description: text("description"),
  status: varchar("status").notNull().default("pending_approval"), // 'pending_approval' | 'amends_required' | 'approved'
  customerNotes: text("customer_notes"), // customer notes when requesting amends
  uploadedById: varchar("uploaded_by_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const sampleFiles = pgTable("sample_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sampleId: varchar("sample_id").notNull().references(() => samples.id, { onDelete: "cascade" }),
  fileName: varchar("file_name").notNull(),
  fileUrl: varchar("file_url").notNull(),
  fileSize: integer("file_size").notNull(),
  fileType: varchar("file_type").notNull(),
  uploadedBy: varchar("uploaded_by").notNull(), // 'customer' | 'staff'
  uploaderId: varchar("uploader_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Job errors - track quality issues on completed orders
export const jobErrors = pgTable("job_errors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  errorDescription: text("error_description").notNull(),
  errorType: varchar("error_type").notNull().default("quality"), // quality, quantity, delivery, other
  assignedToId: varchar("assigned_to_id").references(() => staff.id), // Staff member responsible for the error
  reportedById: varchar("reported_by_id").notNull().references(() => users.id),
  reportedAt: timestamp("reported_at").notNull().defaultNow(),
  resolved: boolean("resolved").notNull().default(false),
  resolvedById: varchar("resolved_by_id").references(() => users.id),
  resolvedAt: timestamp("resolved_at"),
  resolutionNotes: text("resolution_notes"),
}, (table) => [
  index("job_errors_job_id_idx").on(table.jobId),
  index("job_errors_resolved_idx").on(table.resolved),
  index("job_errors_assigned_to_idx").on(table.assignedToId),
]);

// Customer portal: shared documents (Google Drive links visible to all customers)
export const customerDocuments = pgTable("customer_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title").notNull(),
  description: text("description"),
  driveUrl: varchar("drive_url").notNull(),
  category: varchar("category").default("general"), // general, pricing, policies, guides
  sortOrder: integer("sort_order").default(0),
  active: boolean("active").notNull().default(true),
  createdById: varchar("created_by_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCustomerDocumentSchema = createInsertSchema(customerDocuments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CustomerDocument = typeof customerDocuments.$inferSelect;
export type InsertCustomerDocument = z.infer<typeof insertCustomerDocumentSchema>;

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
  logoUrl: z.string().optional().or(z.literal("")).or(z.null()),
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
    z.union([z.number().int().min(1).max(5), z.null()])
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
  deliveryAddressType: z.preprocess(
    (val) => val === "" ? null : val,
    z.string().nullable().optional()
  ),
  deliveryAddress: z.preprocess(
    (val) => val === "" ? null : val,
    z.string().nullable().optional()
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
  machineId: z.number().int().min(1).max(5),
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
  lineItemId: z.string().nullable().optional(),
  machineId: z.number().int().min(1).max(5),
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
  machineId: z.number().int().min(1).max(5).optional(),
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
  machineId: z.number().int().min(1).max(5).optional(),
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
  position: z.string().nullable().optional(),
  positionOther: z.string().nullable().optional(),
  logoApproved: z.preprocess(
    (val) => val === true || val === 'true' || val === 1 || val === '1',
    z.boolean()
  ).default(false),
  completed: z.coerce.boolean().default(false),
  description: z.string().nullable().optional(),
  completedById: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  actualProductionTimeMinutes: z.coerce.number().int().min(0).nullable().optional(),
  machineId: z.preprocess(
    (val) => {
      if (val === null || val === undefined || val === "") return null;
      if (typeof val === "string") return parseInt(val, 10);
      return val;
    },
    z.union([z.number().int().min(1).max(5), z.null()])
  ).optional(),
});

export const updateJobLineItemSchema = z.object({
  quantity: z.coerce.number().int().min(0).optional(),
  description: z.string().nullable().optional(),
  stitchCount: z.coerce.number().int().min(0).optional(),
  position: z.string().nullable().optional(),
  positionOther: z.string().nullable().optional(),
  logoApproved: z.coerce.boolean().optional(),
  completed: z.coerce.boolean().optional(),
  completedById: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  actualProductionTimeMinutes: z.coerce.number().int().min(0).nullable().optional(),
  machineId: z.preprocess(
    (val) => {
      if (val === undefined) return undefined;
      if (val === null || val === "") return null;
      if (typeof val === "string") return parseInt(val, 10);
      return val;
    },
    z.union([z.number().int().min(1).max(5), z.null()]).optional()
  ),
}).refine(
  (data) => {
    // If completed is true and this is an embroidery job, require machineId, completedById, and actualProductionTime
    // Note: We can't check jobType here as it's not in the update schema
    // The UI/backend will need to enforce this based on the line item's jobType
    if (data.completed === true) {
      return data.completedById !== null && data.completedById !== undefined;
    }
    return true;
  },
  {
    message: "Completed by is required when marking a line item as completed",
    path: ["completedById"],
  }
);

export type InsertJobLineItem = z.infer<typeof insertJobLineItemSchema>;
export type JobLineItem = typeof jobLineItems.$inferSelect;

export type JobWithLineItems = Job & {
  lineItems: JobLineItem[];
};

// Production entries schemas and types
export const insertProductionEntrySchema = createInsertSchema(productionEntries).omit({
  id: true,
  createdAt: true,
}).extend({
  workDate: z.string(), // Accept ISO date string
  quantityCompleted: z.coerce.number().int().min(1),
  productionTimeMinutes: z.coerce.number().int().min(1),
  machineId: z.preprocess(
    (val) => {
      if (val === null || val === undefined || val === "") return null;
      if (typeof val === "string") return parseInt(val, 10);
      return val;
    },
    z.union([z.number().int().min(1).max(5), z.null()]).optional()
  ),
  notes: z.string().nullable().optional(),
});

export type InsertProductionEntry = z.infer<typeof insertProductionEntrySchema>;
export type ProductionEntry = typeof productionEntries.$inferSelect;

export const insertStaffMachineAllocationSchema = createInsertSchema(staffMachineAllocations).omit({
  id: true,
}).extend({
  date: z.string(),
  machineId: z.number().int().min(1).max(5),
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
  machineId: z.number().int().min(1).max(5).optional(),
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

export const insertStaffHolidaySchema = createInsertSchema(staffHolidays).omit({
  id: true,
  createdAt: true,
}).extend({
  startDate: z.string(),
  endDate: z.string(),
  holidayType: z.enum(["holiday", "sick", "other"]).default("holiday"),
  notes: z.string().optional(),
}).refine(
  (data) => new Date(data.endDate) >= new Date(data.startDate),
  { message: "End date must be on or after start date" }
);

export const updateStaffHolidaySchema = z.object({
  staffId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  holidayType: z.enum(["holiday", "sick", "other"]).optional(),
  notes: z.string().optional(),
});

export type InsertStaffHoliday = z.infer<typeof insertStaffHolidaySchema>;
export type StaffHoliday = typeof staffHolidays.$inferSelect;

export const insertBankHolidaySchema = createInsertSchema(bankHolidays).omit({
  id: true,
  createdAt: true,
}).extend({
  date: z.string(),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
});

export const updateBankHolidaySchema = z.object({
  date: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
});

export type InsertBankHoliday = z.infer<typeof insertBankHolidaySchema>;
export type BankHoliday = typeof bankHolidays.$inferSelect;

export const insertLogoSetupSchema = createInsertSchema(logoSetups).omit({
  id: true,
  createdAt: true,
  approvedAt: true,
  invoicedAt: true,
  invoiceReference: true,
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
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

export const updateCustomerUserSchema = z.object({
  email: z.string().email().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

export type UpdateCustomerUser = z.infer<typeof updateCustomerUserSchema>;

export const customerLoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const insertJobMessageSchema = createInsertSchema(jobMessages).omit({
  id: true,
  createdAt: true,
  readByStaff: true,
  readByCustomer: true,
}).extend({
  message: z.string().min(1, "Message cannot be empty"),
  senderType: z.enum(["customer", "staff"]),
});

export const insertJobFileSchema = createInsertSchema(jobFiles).omit({
  id: true,
  createdAt: true,
}).extend({
  fileName: z.string().min(1),
  fileUrl: z.string().min(1), // Path or URL - not required to be a full URL
  fileSize: z.number().int().positive(),
  fileType: z.string().min(1),
  uploadedBy: z.enum(["customer", "staff"]),
});

// Customer job submission schema
export const customerJobSubmissionSchema = z.object({
  jobName: z.string().min(1, "Job name is required"),
  poNumber: z.string().optional(),
  quantity: z.number().int().min(1).optional().nullable(),
  notes: z.string().optional(),
  deliveryAddress: z.string().optional(),
  requiredDispatchDate: z.string().min(1, "Dispatch date is required"),
  logoType: z.enum(["repeat_logo", "new_logo"]).default("repeat_logo"),
});

export type InsertCustomerUser = z.infer<typeof insertCustomerUserSchema>;
export type CustomerUser = typeof customerUsers.$inferSelect;
export type CustomerLogin = z.infer<typeof customerLoginSchema>;
export type CustomerJobSubmission = z.infer<typeof customerJobSubmissionSchema>;
export type InsertJobMessage = z.infer<typeof insertJobMessageSchema>;
export type JobMessage = typeof jobMessages.$inferSelect;
export type InsertJobFile = z.infer<typeof insertJobFileSchema>;
export type JobFile = typeof jobFiles.$inferSelect;

// Direct conversations
export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  subject: z.string().min(1, "Subject is required"),
  customerId: z.string().optional().nullable(),
  staffRecipientId: z.string().optional().nullable(),
}).refine(data => data.customerId || data.staffRecipientId, {
  message: "Either customerId or staffRecipientId is required",
});

export const insertConversationMessageSchema = createInsertSchema(conversationMessages).omit({
  id: true,
  createdAt: true,
  readByStaff: true,
  readByCustomer: true,
}).extend({
  message: z.string().min(1, "Message cannot be empty"),
  senderType: z.enum(["customer", "staff"]),
});

export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversationMessage = z.infer<typeof insertConversationMessageSchema>;
export type ConversationMessage = typeof conversationMessages.$inferSelect;

// Samples
export const insertSampleSchema = createInsertSchema(samples).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  customerNotes: true,
}).extend({
  title: z.string().min(1, "Title is required"),
  status: z.enum(["pending_approval", "amends_required", "approved"]).default("pending_approval"),
});

export const insertSampleFileSchema = createInsertSchema(sampleFiles).omit({
  id: true,
  createdAt: true,
}).extend({
  fileName: z.string().min(1),
  fileUrl: z.string().min(1),
  fileSize: z.number().int().positive(),
  fileType: z.string().min(1),
  uploadedBy: z.enum(["customer", "staff"]),
});

export type InsertSample = z.infer<typeof insertSampleSchema>;
export type Sample = typeof samples.$inferSelect;
export type InsertSampleFile = z.infer<typeof insertSampleFileSchema>;
export type SampleFile = typeof sampleFiles.$inferSelect;

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

export const insertImpersonationSessionSchema = createInsertSchema(impersonationSessions).omit({
  id: true,
  createdAt: true,
});
export type InsertImpersonationSession = z.infer<typeof insertImpersonationSessionSchema>;
export type ImpersonationSession = typeof impersonationSessions.$inferSelect;

// Job errors schemas and types
export const insertJobErrorSchema = createInsertSchema(jobErrors).omit({
  id: true,
  reportedAt: true,
  resolved: true,
  resolvedById: true,
  resolvedAt: true,
  resolutionNotes: true,
});
export const updateJobErrorSchema = z.object({
  resolved: z.boolean().optional(),
  resolvedById: z.string().nullable().optional(),
  resolvedAt: z.date().nullable().optional(),
  resolutionNotes: z.string().nullable().optional(),
  assignedToId: z.string().nullable().optional(),
});
export type InsertJobError = z.infer<typeof insertJobErrorSchema>;
export type JobError = typeof jobErrors.$inferSelect;

// Production Display types
export interface ProductionQueueLineItem {
  lineItemId: string;
  description: string | null;
  quantity: number;
  stitchCount: number;
  machineId: number | null;
  machineName: string;
  staffId: string | null;
  staffName: string;
  scheduledStart: number | null;
  scheduledEnd: number | null;
}

export interface ProductionQueueJob {
  jobId: string;
  jobNumber: number | null;
  customerName: string;
  jobName: string;
  requiredDispatchDate: string | null;
  lineItems: ProductionQueueLineItem[];
}

export interface ProductionQueueDateGroup {
  date: string;
  jobs: ProductionQueueJob[];
}

export interface LeaderboardMachineUsage {
  [machineName: string]: number; // hours
}

export interface ProductionDisplayLeader {
  staffId: string;
  staffName: string;
  yellowStars: number;
  redStars: number;
  totalStitches: number;
  totalHours: number;
  stitchesPerHeadHour: number;
  machines: LeaderboardMachineUsage;
}

export interface ProductionDisplayLeaderboard {
  generatedAt: string;
  range: {
    start: string;
    end: string;
  };
  leaders: ProductionDisplayLeader[];
}

// App settings — key/value store for persisting server-side config (e.g. Xero tokens)
export const appSettings = pgTable("app_settings", {
  key: varchar("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type AppSetting = typeof appSettings.$inferSelect;

// Machines table — stores each embroidery machine with capacity and status
export const machines = pgTable("machines", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  heads: integer("heads").notNull().default(6),
  stitchesPerMinute: integer("stitches_per_minute").notNull().default(750),
  changeoverTimeMinutes: integer("changeover_time_minutes").notNull().default(3),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
});

export const insertMachineSchema = createInsertSchema(machines).omit({ id: true });

export const updateMachineSchema = z.object({
  name: z.string().min(1).optional(),
  heads: z.number().int().min(1).max(50).optional(),
  stitchesPerMinute: z.number().int().min(100).max(5000).optional(),
  changeoverTimeMinutes: z.number().int().min(0).max(60).optional(),
  isActive: z.boolean().optional(),
  notes: z.string().optional(),
});

export type InsertMachine = z.infer<typeof insertMachineSchema>;
export type Machine = typeof machines.$inferSelect;
