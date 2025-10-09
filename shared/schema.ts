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

export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
});

export const insertStaffSchema = createInsertSchema(staff).omit({
  id: true,
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

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customers.$inferSelect;
export type InsertStaff = z.infer<typeof insertStaffSchema>;
export type Staff = typeof staff.$inferSelect;
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobs.$inferSelect;
