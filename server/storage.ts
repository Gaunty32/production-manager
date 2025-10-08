import { type Customer, type InsertCustomer, type Job, type InsertJob } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getCustomers(): Promise<Customer[]>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  getJobs(): Promise<Job[]>;
  createJob(job: InsertJob): Promise<Job>;
  updateJob(id: string, job: Partial<Job>): Promise<Job>;
  deleteJob(id: string): Promise<void>;
}

export class MemStorage implements IStorage {
  private customers: Map<string, Customer>;
  private jobs: Map<string, Job>;

  constructor() {
    this.customers = new Map();
    this.jobs = new Map();
  }

  async getCustomers(): Promise<Customer[]> {
    return Array.from(this.customers.values());
  }

  async createCustomer(insertCustomer: InsertCustomer): Promise<Customer> {
    const id = randomUUID();
    const customer: Customer = { ...insertCustomer, id };
    this.customers.set(id, customer);
    return customer;
  }

  async getJobs(): Promise<Job[]> {
    return Array.from(this.jobs.values());
  }

  async createJob(insertJob: InsertJob): Promise<Job> {
    const id = randomUUID();
    const job: Job = {
      ...insertJob,
      id,
      dateReceived: new Date(insertJob.dateReceived),
      requiredDispatchDate: new Date(insertJob.requiredDispatchDate),
      status: insertJob.status || "pending",
      logoApproved: insertJob.logoApproved || false,
      completedOnTime: insertJob.completedOnTime || null,
      machineId: insertJob.machineId || null,
    };
    this.jobs.set(id, job);
    return job;
  }

  async updateJob(id: string, updates: Partial<Job>): Promise<Job> {
    const job = this.jobs.get(id);
    if (!job) throw new Error("Job not found");
    const updatedJob = { ...job, ...updates };
    this.jobs.set(id, updatedJob);
    return updatedJob;
  }

  async deleteJob(id: string): Promise<void> {
    this.jobs.delete(id);
  }
}

export const storage = new MemStorage();
