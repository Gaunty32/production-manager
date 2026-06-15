import type { Express } from "express";
import { db } from "./db";
import { isStaffAuthenticated } from "./staffAuth";
import { eq, and, gte, lte, lt, ne, desc, sql } from "drizzle-orm";
import {
  suppliers,
  consumables,
  purchaseOrders,
  purchaseOrderItems,
  jobLineItems,
  insertSupplierSchema,
  insertConsumableSchema,
  insertPurchaseOrderSchema,
  type ConsumableWithStats,
  type PurchaseOrderWithDetails,
  type PurchasingDashboard,
} from "@shared/schema";

// --- date helpers (server-local; the app runs in Europe/London) ---
function startOfMonth(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}
function startOfNextMonth(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0);
}
function startOfYear(d = new Date()): Date {
  return new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0);
}
function startOfNextYear(d = new Date()): Date {
  return new Date(d.getFullYear() + 1, 0, 1, 0, 0, 0, 0);
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

async function nextPoNumber(): Promise<string> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(purchaseOrders);
  return `PO-${String((count ?? 0) + 1).padStart(4, "0")}`;
}

// Seed the two production consumables on first use so the bulk rules are ready.
async function seedProductionConsumablesIfEmpty() {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(consumables);
  if ((count ?? 0) > 0) return;
  await db.insert(consumables).values([
    {
      name: "White Thread",
      category: "Thread",
      unit: "cones",
      isProductionConsumable: true,
      targetStock: 100,
      reorderPoint: 40,
      purchaseQuantity: 100,
      currentStock: 0,
    },
    {
      name: "White Backing",
      category: "Backing",
      unit: "rolls",
      isProductionConsumable: true,
      targetStock: 100,
      reorderPoint: 40,
      purchaseQuantity: 100,
      currentStock: 0,
    },
  ]);
}

type EnrichedPoLine = {
  consumableId: string | null;
  description: string;
  quantity: number;
  unitCost: number;
  status: string;
  orderDate: Date;
  category: string;
};

// Pull all (non-cancelled) PO line activity once; everything else is computed in JS.
async function getPoActivity(): Promise<EnrichedPoLine[]> {
  const rows = await db
    .select({
      consumableId: purchaseOrderItems.consumableId,
      description: purchaseOrderItems.description,
      quantity: purchaseOrderItems.quantity,
      unitCost: purchaseOrderItems.unitCost,
      status: purchaseOrders.status,
      orderDate: purchaseOrders.orderDate,
      category: consumables.category,
    })
    .from(purchaseOrderItems)
    .innerJoin(purchaseOrders, eq(purchaseOrderItems.purchaseOrderId, purchaseOrders.id))
    .leftJoin(consumables, eq(purchaseOrderItems.consumableId, consumables.id))
    .where(ne(purchaseOrders.status, "cancelled"));
  return rows.map((r) => ({
    consumableId: r.consumableId,
    description: r.description,
    quantity: r.quantity ?? 0,
    unitCost: r.unitCost ?? 0,
    status: r.status,
    orderDate: r.orderDate,
    category: r.category ?? "Other",
  }));
}

export function registerPurchasingRoutes(app: Express) {
  // ---------------- Dashboard ----------------
  app.get("/api/purchasing/dashboard", isStaffAuthenticated, async (_req, res) => {
    try {
      await seedProductionConsumablesIfEmpty();
      const activity = await getPoActivity();
      const monthStart = startOfMonth();
      const monthEnd = startOfNextMonth();
      const yearStart = startOfYear();
      const yearEnd = startOfNextYear();

      let monthlySpend = 0;
      let annualSpend = 0;
      const byCategory = new Map<string, number>();
      for (const line of activity) {
        const lineTotal = line.quantity * line.unitCost;
        const od = new Date(line.orderDate);
        if (od >= monthStart && od < monthEnd) monthlySpend += lineTotal;
        if (od >= yearStart && od < yearEnd) {
          annualSpend += lineTotal;
          byCategory.set(line.category, (byCategory.get(line.category) ?? 0) + lineTotal);
        }
      }

      const [{ openCount }] = await db
        .select({ openCount: sql<number>`count(*)::int` })
        .from(purchaseOrders)
        .where(eq(purchaseOrders.status, "open"));

      const [{ reorderCount }] = await db
        .select({ reorderCount: sql<number>`count(*)::int` })
        .from(consumables)
        .where(
          and(
            eq(consumables.active, true),
            sql`${consumables.reorderPoint} is not null`,
            sql`${consumables.currentStock} <= ${consumables.reorderPoint}`,
          ),
        );

      const [{ garments }] = await db
        .select({ garments: sql<number>`coalesce(sum(${jobLineItems.quantity}), 0)::int` })
        .from(jobLineItems)
        .where(
          and(
            eq(jobLineItems.completed, true),
            gte(jobLineItems.completedAt, monthStart),
            lt(jobLineItems.completedAt, monthEnd),
          ),
        );

      const garmentsProducedThisMonth = garments ?? 0;
      const costPerGarment =
        garmentsProducedThisMonth > 0 ? round2(monthlySpend / garmentsProducedThisMonth) : null;

      const dashboard: PurchasingDashboard = {
        monthlySpend: round2(monthlySpend),
        annualSpend: round2(annualSpend),
        openPurchaseOrders: openCount ?? 0,
        itemsRequiringReorder: reorderCount ?? 0,
        spendByCategory: Array.from(byCategory.entries())
          .map(([category, spend]) => ({ category, spend: round2(spend) }))
          .sort((a, b) => b.spend - a.spend),
        garmentsProducedThisMonth,
        costPerGarment,
      };
      res.json(dashboard);
    } catch (err) {
      console.error("[purchasing] dashboard error", err);
      res.status(500).json({ message: "Failed to load purchasing dashboard" });
    }
  });

  // ---------------- Consumables ----------------
  app.get("/api/purchasing/consumables", isStaffAuthenticated, async (_req, res) => {
    try {
      await seedProductionConsumablesIfEmpty();
      const [items, supplierRows, activity] = await Promise.all([
        db.select().from(consumables).orderBy(desc(consumables.isProductionConsumable), consumables.name),
        db.select().from(suppliers),
        getPoActivity(),
      ]);
      const supplierName = new Map(supplierRows.map((s) => [s.id, s.name]));

      const stats = new Map<
        string,
        { totalPurchased: number; totalSpend: number; lastPurchaseDate: Date | null }
      >();
      for (const line of activity) {
        if (!line.consumableId) continue;
        const cur = stats.get(line.consumableId) ?? {
          totalPurchased: 0,
          totalSpend: 0,
          lastPurchaseDate: null,
        };
        cur.totalPurchased += line.quantity;
        cur.totalSpend += line.quantity * line.unitCost;
        const od = new Date(line.orderDate);
        if (!cur.lastPurchaseDate || od > cur.lastPurchaseDate) cur.lastPurchaseDate = od;
        stats.set(line.consumableId, cur);
      }

      const enriched: ConsumableWithStats[] = items.map((item) => {
        const s = stats.get(item.id);
        const totalPurchased = s?.totalPurchased ?? 0;
        const totalSpend = s?.totalSpend ?? 0;
        return {
          ...item,
          totalPurchased,
          totalSpend: round2(totalSpend),
          averageCost: totalPurchased > 0 ? round2(totalSpend / totalPurchased) : null,
          lastPurchaseDate: s?.lastPurchaseDate ? s.lastPurchaseDate.toISOString() : null,
          needsReorder:
            item.active &&
            item.reorderPoint != null &&
            item.currentStock <= item.reorderPoint,
          supplierName: item.preferredSupplierId
            ? supplierName.get(item.preferredSupplierId) ?? null
            : null,
        };
      });
      res.json(enriched);
    } catch (err) {
      console.error("[purchasing] list consumables error", err);
      res.status(500).json({ message: "Failed to load consumables" });
    }
  });

  app.post("/api/purchasing/consumables", isStaffAuthenticated, async (req, res) => {
    try {
      const parsed = insertConsumableSchema.parse(req.body);
      const [created] = await db.insert(consumables).values(parsed).returning();
      res.status(201).json(created);
    } catch (err: any) {
      if (err?.issues) return res.status(400).json({ message: "Invalid data", errors: err.issues });
      console.error("[purchasing] create consumable error", err);
      res.status(500).json({ message: "Failed to create consumable" });
    }
  });

  app.patch("/api/purchasing/consumables/:id", isStaffAuthenticated, async (req, res) => {
    try {
      const parsed = insertConsumableSchema.partial().parse(req.body);
      const [updated] = await db
        .update(consumables)
        .set(parsed)
        .where(eq(consumables.id, req.params.id))
        .returning();
      if (!updated) return res.status(404).json({ message: "Consumable not found" });
      res.json(updated);
    } catch (err: any) {
      if (err?.issues) return res.status(400).json({ message: "Invalid data", errors: err.issues });
      console.error("[purchasing] update consumable error", err);
      res.status(500).json({ message: "Failed to update consumable" });
    }
  });

  app.delete("/api/purchasing/consumables/:id", isStaffAuthenticated, async (req, res) => {
    try {
      await db.delete(consumables).where(eq(consumables.id, req.params.id));
      res.json({ success: true });
    } catch (err) {
      console.error("[purchasing] delete consumable error", err);
      res.status(500).json({ message: "Failed to delete consumable" });
    }
  });

  // ---------------- Suppliers ----------------
  app.get("/api/purchasing/suppliers", isStaffAuthenticated, async (_req, res) => {
    try {
      const rows = await db.select().from(suppliers).orderBy(suppliers.name);
      res.json(rows);
    } catch (err) {
      console.error("[purchasing] list suppliers error", err);
      res.status(500).json({ message: "Failed to load suppliers" });
    }
  });

  app.post("/api/purchasing/suppliers", isStaffAuthenticated, async (req, res) => {
    try {
      const parsed = insertSupplierSchema.parse(req.body);
      const [created] = await db.insert(suppliers).values(parsed).returning();
      res.status(201).json(created);
    } catch (err: any) {
      if (err?.issues) return res.status(400).json({ message: "Invalid data", errors: err.issues });
      console.error("[purchasing] create supplier error", err);
      res.status(500).json({ message: "Failed to create supplier" });
    }
  });

  app.patch("/api/purchasing/suppliers/:id", isStaffAuthenticated, async (req, res) => {
    try {
      const parsed = insertSupplierSchema.partial().parse(req.body);
      const [updated] = await db
        .update(suppliers)
        .set(parsed)
        .where(eq(suppliers.id, req.params.id))
        .returning();
      if (!updated) return res.status(404).json({ message: "Supplier not found" });
      res.json(updated);
    } catch (err: any) {
      if (err?.issues) return res.status(400).json({ message: "Invalid data", errors: err.issues });
      console.error("[purchasing] update supplier error", err);
      res.status(500).json({ message: "Failed to update supplier" });
    }
  });

  app.delete("/api/purchasing/suppliers/:id", isStaffAuthenticated, async (req, res) => {
    try {
      await db.delete(suppliers).where(eq(suppliers.id, req.params.id));
      res.json({ success: true });
    } catch (err) {
      console.error("[purchasing] delete supplier error", err);
      res.status(500).json({ message: "Failed to delete supplier" });
    }
  });

  // ---------------- Purchase Orders ----------------
  app.get("/api/purchasing/purchase-orders", isStaffAuthenticated, async (_req, res) => {
    try {
      const [orders, allLines, supplierRows] = await Promise.all([
        db.select().from(purchaseOrders).orderBy(desc(purchaseOrders.orderDate)),
        db.select().from(purchaseOrderItems),
        db.select().from(suppliers),
      ]);
      const supplierName = new Map(supplierRows.map((s) => [s.id, s.name]));
      const linesByPo = new Map<string, typeof allLines>();
      for (const line of allLines) {
        const arr = linesByPo.get(line.purchaseOrderId) ?? [];
        arr.push(line);
        linesByPo.set(line.purchaseOrderId, arr);
      }
      const result: PurchaseOrderWithDetails[] = orders.map((po) => {
        const lineItems = linesByPo.get(po.id) ?? [];
        const total = lineItems.reduce((sum, l) => sum + (l.quantity ?? 0) * (l.unitCost ?? 0), 0);
        return {
          ...po,
          supplierName: po.supplierId ? supplierName.get(po.supplierId) ?? null : null,
          lineItems,
          total: round2(total),
        };
      });
      res.json(result);
    } catch (err) {
      console.error("[purchasing] list purchase orders error", err);
      res.status(500).json({ message: "Failed to load purchase orders" });
    }
  });

  app.post("/api/purchasing/purchase-orders", isStaffAuthenticated, async (req, res) => {
    try {
      const parsed = insertPurchaseOrderSchema.parse(req.body);
      const poNumber = await nextPoNumber();
      const result = await db.transaction(async (tx) => {
        const [po] = await tx
          .insert(purchaseOrders)
          .values({
            poNumber,
            supplierId: parsed.supplierId ?? null,
            status: parsed.status,
            orderDate: parsed.orderDate ?? new Date(),
            expectedDate: parsed.expectedDate ?? null,
            receivedDate: parsed.status === "received" ? parsed.receivedDate ?? new Date() : null,
            stockApplied: parsed.status === "received",
            notes: parsed.notes ?? null,
          })
          .returning();

        await tx.insert(purchaseOrderItems).values(
          parsed.lineItems.map((l) => ({
            purchaseOrderId: po.id,
            consumableId: l.consumableId ?? null,
            description: l.description,
            quantity: l.quantity,
            unitCost: l.unitCost,
          })),
        );

        // If created already received, add quantities to stock estimates.
        if (parsed.status === "received") {
          for (const l of parsed.lineItems) {
            if (!l.consumableId) continue;
            await tx
              .update(consumables)
              .set({ currentStock: sql`${consumables.currentStock} + ${l.quantity}` })
              .where(eq(consumables.id, l.consumableId));
          }
        }
        return po;
      });
      res.status(201).json(result);
    } catch (err: any) {
      if (err?.issues) return res.status(400).json({ message: "Invalid data", errors: err.issues });
      console.error("[purchasing] create purchase order error", err);
      res.status(500).json({ message: "Failed to create purchase order" });
    }
  });

  // Change status. Receiving a PO adds its quantities to stock estimates (once).
  app.patch("/api/purchasing/purchase-orders/:id/status", isStaffAuthenticated, async (req, res) => {
    try {
      const status = req.body?.status as string;
      if (!["open", "received", "cancelled"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      const result = await db.transaction(async (tx) => {
        const [po] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, req.params.id));
        if (!po) return null;

        // Stock is applied at most once per PO, tracked by the durable stockApplied
        // flag — never re-applied even if the PO is toggled received → open → received.
        const applyStock = status === "received" && !po.stockApplied;

        const [updated] = await tx
          .update(purchaseOrders)
          .set({
            status,
            receivedDate: status === "received" ? po.receivedDate ?? new Date() : po.receivedDate,
            stockApplied: po.stockApplied || applyStock,
          })
          .where(eq(purchaseOrders.id, po.id))
          .returning();

        if (applyStock) {
          const lines = await tx
            .select()
            .from(purchaseOrderItems)
            .where(eq(purchaseOrderItems.purchaseOrderId, po.id));
          for (const l of lines) {
            if (!l.consumableId) continue;
            await tx
              .update(consumables)
              .set({ currentStock: sql`${consumables.currentStock} + ${l.quantity}` })
              .where(eq(consumables.id, l.consumableId));
          }
        }
        return updated;
      });
      if (!result) return res.status(404).json({ message: "Purchase order not found" });
      res.json(result);
    } catch (err) {
      console.error("[purchasing] update PO status error", err);
      res.status(500).json({ message: "Failed to update purchase order" });
    }
  });

  app.delete("/api/purchasing/purchase-orders/:id", isStaffAuthenticated, async (req, res) => {
    try {
      await db.transaction(async (tx) => {
        const [po] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, req.params.id));
        if (!po) return;
        // If this PO's quantities were added to stock, reverse them before deleting
        // so stock estimates stay consistent with the remaining purchase history.
        if (po.stockApplied) {
          const lines = await tx
            .select()
            .from(purchaseOrderItems)
            .where(eq(purchaseOrderItems.purchaseOrderId, po.id));
          for (const l of lines) {
            if (!l.consumableId) continue;
            await tx
              .update(consumables)
              .set({ currentStock: sql`greatest(0, ${consumables.currentStock} - ${l.quantity})` })
              .where(eq(consumables.id, l.consumableId));
          }
        }
        await tx.delete(purchaseOrders).where(eq(purchaseOrders.id, po.id));
      });
      res.json({ success: true });
    } catch (err) {
      console.error("[purchasing] delete purchase order error", err);
      res.status(500).json({ message: "Failed to delete purchase order" });
    }
  });
}
