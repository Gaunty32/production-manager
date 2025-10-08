import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const customers = pgTable("customers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
});

export const jobs = pgTable("jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  jobName: text("job_name").notNull(),
  poNumber: text("po_number").notNull(),
  logoApproved: boolean("logo_approved").notNull().default(false),
  quantity: integer("quantity").notNull(),
  dateReceived: timestamp("date_received").notNull(),
  requiredDispatchDate: timestamp("required_dispatch_date").notNull(),
  completedOnTime: boolean("completed_on_time"),
  machineId: integer("machine_id"),
  status: text("status").notNull().default("pending"),
});

export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
});

export const insertJobSchema = createInsertSchema(jobs).omit({
  id: true,
}).extend({
  dateReceived: z.string(),
  requiredDispatchDate: z.string(),
});

export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customers.$inferSelect;
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobs.$inferSelect;
