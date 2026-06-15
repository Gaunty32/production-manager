import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  CONSUMABLE_CATEGORIES,
  type ConsumableWithStats,
  type Supplier,
  type PurchaseOrderWithDetails,
  type PurchasingDashboard,
} from "@shared/schema";
import {
  PoundSterling,
  CalendarDays,
  ShoppingCart,
  AlertTriangle,
  Plus,
  Pencil,
  Trash2,
  Package,
  Truck,
  Boxes,
  Shirt,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

const NO_SUPPLIER = "__none__";
const FREE_TEXT = "__free__";

function gbp(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(n);
}

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ============================================================
// Dashboard tab
// ============================================================
function DashboardTab() {
  const { data, isLoading } = useQuery<PurchasingDashboard>({
    queryKey: ["/api/purchasing/dashboard"],
  });

  if (isLoading || !data) {
    return <div className="text-muted-foreground" data-testid="text-dashboard-loading">Loading…</div>;
  }

  const maxCat = Math.max(1, ...data.spendByCategory.map((c) => c.spend));

  const kpis = [
    { label: "Monthly Spend", value: gbp(data.monthlySpend), icon: PoundSterling, testid: "kpi-monthly-spend" },
    { label: "Annual Spend", value: gbp(data.annualSpend), icon: CalendarDays, testid: "kpi-annual-spend" },
    { label: "Open Purchase Orders", value: String(data.openPurchaseOrders), icon: ShoppingCart, testid: "kpi-open-pos" },
    { label: "Items Requiring Reorder", value: String(data.itemsRequiringReorder), icon: AlertTriangle, testid: "kpi-reorder", alert: data.itemsRequiringReorder > 0 },
    { label: "Cost / Garment (this month)", value: data.costPerGarment == null ? "—" : gbp(data.costPerGarment), icon: Shirt, testid: "kpi-cost-per-garment" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {kpis.map((k) => (
          <Card key={k.label} data-testid={k.testid}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{k.label}</CardTitle>
              <k.icon className={`h-4 w-4 ${k.alert ? "text-destructive" : "text-muted-foreground"}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${k.alert ? "text-destructive" : ""}`}>{k.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Spend by Category</CardTitle>
            <CardDescription>This year, across all suppliers</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.spendByCategory.length === 0 && (
              <p className="text-sm text-muted-foreground" data-testid="text-no-category-spend">No spend recorded yet.</p>
            )}
            {data.spendByCategory.map((c) => (
              <div key={c.category} className="space-y-1" data-testid={`row-category-${c.category}`}>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span>{c.category}</span>
                  <span className="font-medium">{gbp(c.spend)}</span>
                </div>
                <div className="h-2 rounded-md bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-md"
                    style={{ width: `${(c.spend / maxCat) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Consumable Cost per Garment</CardTitle>
            <CardDescription>Monthly consumable spend ÷ garments produced</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-3xl font-bold" data-testid="text-cost-per-garment-detail">
              {data.costPerGarment == null ? "—" : gbp(data.costPerGarment)}
            </div>
            <p className="text-sm text-muted-foreground">
              {gbp(data.monthlySpend)} spent this month ÷ {data.garmentsProducedThisMonth.toLocaleString("en-GB")} garments produced
            </p>
            {data.garmentsProducedThisMonth === 0 && (
              <p className="text-sm text-muted-foreground">
                No completed garments recorded this month yet, so cost per garment can't be calculated.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ============================================================
// Consumables tab
// ============================================================
const emptyItem = {
  name: "",
  category: "Other" as (typeof CONSUMABLE_CATEGORIES)[number],
  unit: "units",
  isProductionConsumable: false,
  targetStock: "" as string | number,
  reorderPoint: "" as string | number,
  purchaseQuantity: "" as string | number,
  currentStock: 0 as string | number,
  preferredSupplierId: NO_SUPPLIER,
  notes: "",
};

function ConsumablesTab() {
  const { toast } = useToast();
  const { data: items = [], isLoading } = useQuery<ConsumableWithStats[]>({
    queryKey: ["/api/purchasing/consumables"],
  });
  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["/api/purchasing/suppliers"],
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyItem });
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/purchasing/consumables"] });
    queryClient.invalidateQueries({ queryKey: ["/api/purchasing/dashboard"] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        category: form.category,
        unit: form.unit,
        isProductionConsumable: form.isProductionConsumable,
        targetStock: form.targetStock === "" ? null : Number(form.targetStock),
        reorderPoint: form.reorderPoint === "" ? null : Number(form.reorderPoint),
        purchaseQuantity: form.purchaseQuantity === "" ? null : Number(form.purchaseQuantity),
        currentStock: form.currentStock === "" ? 0 : Number(form.currentStock),
        preferredSupplierId: form.preferredSupplierId === NO_SUPPLIER ? null : form.preferredSupplierId,
        notes: form.notes || null,
      };
      if (editingId) {
        await apiRequest("PATCH", `/api/purchasing/consumables/${editingId}`, payload);
      } else {
        await apiRequest("POST", "/api/purchasing/consumables", payload);
      }
    },
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
      toast({ title: editingId ? "Item updated" : "Item added" });
    },
    onError: (e: any) => toast({ title: "Couldn't save item", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/purchasing/consumables/${id}`),
    onSuccess: () => {
      invalidate();
      setDeleteId(null);
      toast({ title: "Item deleted" });
    },
    onError: (e: any) => toast({ title: "Couldn't delete item", description: e.message, variant: "destructive" }),
  });

  const openAdd = () => {
    setEditingId(null);
    setForm({ ...emptyItem });
    setDialogOpen(true);
  };

  const openEdit = (item: ConsumableWithStats) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      category: item.category as any,
      unit: item.unit,
      isProductionConsumable: item.isProductionConsumable,
      targetStock: item.targetStock ?? "",
      reorderPoint: item.reorderPoint ?? "",
      purchaseQuantity: item.purchaseQuantity ?? "",
      currentStock: item.currentStock,
      preferredSupplierId: item.preferredSupplierId ?? NO_SUPPLIER,
      notes: item.notes ?? "",
    });
    setDialogOpen(true);
  };

  const production = items.filter((i) => i.isProductionConsumable);
  const general = items.filter((i) => !i.isProductionConsumable);

  const ItemCard = ({ item }: { item: ConsumableWithStats }) => (
    <Card data-testid={`card-consumable-${item.id}`}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-3">
        <div className="space-y-1 min-w-0">
          <CardTitle className="text-base truncate">{item.name}</CardTitle>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">{item.category}</Badge>
            {item.needsReorder && (
              <Badge variant="destructive" data-testid={`badge-reorder-${item.id}`}>Reorder</Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button size="icon" variant="ghost" onClick={() => openEdit(item)} data-testid={`button-edit-${item.id}`}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => setDeleteId(item.id)} data-testid={`button-delete-${item.id}`}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Stat label="Current stock" value={`${item.currentStock} ${item.unit}`} />
          <Stat label="Reorder at" value={item.reorderPoint != null ? `${item.reorderPoint} ${item.unit}` : "—"} />
          <Stat label="Target" value={item.targetStock != null ? `${item.targetStock} ${item.unit}` : "—"} />
          <Stat label="Order qty" value={item.purchaseQuantity != null ? `${item.purchaseQuantity} ${item.unit}` : "—"} />
        </div>
        <div className="border-t pt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Stat label="Total purchased" value={`${item.totalPurchased} ${item.unit}`} />
          <Stat label="Total spend" value={gbp(item.totalSpend)} />
          <Stat label="Avg cost" value={item.averageCost != null ? gbp(item.averageCost) : "—"} />
          <Stat label="Last purchase" value={fmtDate(item.lastPurchaseDate)} />
        </div>
        {item.supplierName && (
          <p className="text-sm text-muted-foreground">Supplier: {item.supplierName}</p>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {items.length} item{items.length === 1 ? "" : "s"} tracked
        </p>
        <Button onClick={openAdd} data-testid="button-add-consumable">
          <Plus className="h-4 w-4" />
          Add Item
        </Button>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading…</p>}

      {production.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Boxes className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Production Consumables</h3>
            <span className="text-xs text-muted-foreground">Bulk-purchased — managed by target / reorder rules</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {production.map((item) => <ItemCard key={item.id} item={item} />)}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {production.length > 0 && (
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Other Consumables</h3>
          </div>
        )}
        {general.length === 0 && !isLoading ? (
          <p className="text-sm text-muted-foreground" data-testid="text-no-consumables">No consumables yet. Add your first item to start tracking.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {general.map((item) => <ItemCard key={item.id} item={item} />)}
          </div>
        )}
      </div>

      {/* Add / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Item" : "Add Item"}</DialogTitle>
            <DialogDescription>
              Track a consumable's reorder rules and current stock estimate.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="item-name">Name</Label>
              <Input id="item-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="input-item-name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as any })}>
                  <SelectTrigger data-testid="select-item-category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONSUMABLE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="item-unit">Unit</Label>
                <Input id="item-unit" placeholder="cones, rolls, boxes…" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} data-testid="input-item-unit" />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-md border p-3">
              <div className="space-y-0.5">
                <Label>Production consumable</Label>
                <p className="text-xs text-muted-foreground">Bulk item like White Thread or White Backing</p>
              </div>
              <Switch checked={form.isProductionConsumable} onCheckedChange={(v) => setForm({ ...form, isProductionConsumable: v })} data-testid="switch-production-consumable" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="item-current">Current stock estimate</Label>
                <Input id="item-current" type="number" min={0} value={form.currentStock} onChange={(e) => setForm({ ...form, currentStock: e.target.value })} data-testid="input-item-current-stock" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="item-reorder">Reorder point</Label>
                <Input id="item-reorder" type="number" min={0} placeholder="optional" value={form.reorderPoint} onChange={(e) => setForm({ ...form, reorderPoint: e.target.value })} data-testid="input-item-reorder" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="item-target">Target stock</Label>
                <Input id="item-target" type="number" min={0} placeholder="optional" value={form.targetStock} onChange={(e) => setForm({ ...form, targetStock: e.target.value })} data-testid="input-item-target" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="item-purchaseqty">Purchase quantity</Label>
                <Input id="item-purchaseqty" type="number" min={0} placeholder="optional" value={form.purchaseQuantity} onChange={(e) => setForm({ ...form, purchaseQuantity: e.target.value })} data-testid="input-item-purchase-qty" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Preferred supplier</Label>
              <Select value={form.preferredSupplierId} onValueChange={(v) => setForm({ ...form, preferredSupplierId: v })}>
                <SelectTrigger data-testid="select-item-supplier"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SUPPLIER}>None</SelectItem>
                  {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="item-notes">Notes</Label>
              <Textarea id="item-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="input-item-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!form.name.trim() || saveMutation.isPending} data-testid="button-save-consumable">
              {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this item?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the consumable. Past purchase order lines are kept for spend history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)} data-testid="button-confirm-delete-consumable">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

// ============================================================
// Purchase Orders tab
// ============================================================
type PoLine = { consumableId: string; description: string; quantity: string; unitCost: string };
const emptyLine: PoLine = { consumableId: FREE_TEXT, description: "", quantity: "1", unitCost: "0" };

function PurchaseOrdersTab() {
  const { toast } = useToast();
  const { data: orders = [], isLoading } = useQuery<PurchaseOrderWithDetails[]>({
    queryKey: ["/api/purchasing/purchase-orders"],
  });
  const { data: suppliers = [] } = useQuery<Supplier[]>({ queryKey: ["/api/purchasing/suppliers"] });
  const { data: consumables = [] } = useQuery<ConsumableWithStats[]>({ queryKey: ["/api/purchasing/consumables"] });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [supplierId, setSupplierId] = useState(NO_SUPPLIER);
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<"open" | "received">("open");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<PoLine[]>([{ ...emptyLine }]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/purchasing/purchase-orders"] });
    queryClient.invalidateQueries({ queryKey: ["/api/purchasing/dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["/api/purchasing/consumables"] });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        supplierId: supplierId === NO_SUPPLIER ? null : supplierId,
        status,
        orderDate: new Date(orderDate),
        notes: notes || null,
        lineItems: lines.map((l) => ({
          consumableId: l.consumableId === FREE_TEXT ? null : l.consumableId,
          description: l.description,
          quantity: Number(l.quantity),
          unitCost: Number(l.unitCost),
        })),
      };
      await apiRequest("POST", "/api/purchasing/purchase-orders", payload);
    },
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
      toast({ title: "Purchase order created" });
    },
    onError: (e: any) => toast({ title: "Couldn't create order", description: e.message, variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/purchasing/purchase-orders/${id}/status`, { status }),
    onSuccess: () => {
      invalidate();
      toast({ title: "Order updated" });
    },
    onError: (e: any) => toast({ title: "Couldn't update order", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/purchasing/purchase-orders/${id}`),
    onSuccess: () => {
      invalidate();
      setDeleteId(null);
      toast({ title: "Order deleted" });
    },
    onError: (e: any) => toast({ title: "Couldn't delete order", description: e.message, variant: "destructive" }),
  });

  const openCreate = () => {
    setSupplierId(NO_SUPPLIER);
    setOrderDate(new Date().toISOString().slice(0, 10));
    setStatus("open");
    setNotes("");
    setLines([{ ...emptyLine }]);
    setDialogOpen(true);
  };

  const updateLine = (idx: number, patch: Partial<PoLine>) => {
    setLines((prev) => prev.map((l, i) => {
      if (i !== idx) return l;
      const next = { ...l, ...patch };
      // when picking a known consumable, default the description to its name
      if (patch.consumableId && patch.consumableId !== FREE_TEXT) {
        const c = consumables.find((x) => x.id === patch.consumableId);
        if (c) next.description = c.name;
      }
      return next;
    }));
  };

  const formTotal = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0);
  const formValid = lines.length > 0 && lines.every((l) => l.description.trim() && Number(l.quantity) >= 1);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const statusBadge = (s: string) => {
    if (s === "open") return <Badge variant="default" data-testid="badge-status-open">Open</Badge>;
    if (s === "received") return <Badge variant="secondary">Received</Badge>;
    return <Badge variant="outline">Cancelled</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{orders.length} purchase order{orders.length === 1 ? "" : "s"}</p>
        <Button onClick={openCreate} data-testid="button-new-po">
          <Plus className="h-4 w-4" />
          New Purchase Order
        </Button>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading…</p>}
      {!isLoading && orders.length === 0 && (
        <p className="text-sm text-muted-foreground" data-testid="text-no-pos">No purchase orders yet.</p>
      )}

      <div className="space-y-3">
        {orders.map((po) => {
          const isOpen = expanded.has(po.id);
          return (
            <Card key={po.id} data-testid={`card-po-${po.id}`}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Button size="icon" variant="ghost" onClick={() => toggleExpand(po.id)} data-testid={`button-expand-${po.id}`}>
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                    <div className="min-w-0">
                      <CardTitle className="text-base flex flex-wrap items-center gap-2">
                        {po.poNumber}
                        {statusBadge(po.status)}
                      </CardTitle>
                      <CardDescription>
                        {po.supplierName ?? "No supplier"} · {fmtDate(po.orderDate)} · {po.lineItems.length} line{po.lineItems.length === 1 ? "" : "s"}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold" data-testid={`text-po-total-${po.id}`}>{gbp(po.total)}</span>
                    {po.status === "open" && (
                      <Button size="sm" variant="outline" onClick={() => statusMutation.mutate({ id: po.id, status: "received" })} data-testid={`button-receive-${po.id}`}>
                        <Truck className="h-4 w-4" />
                        Mark received
                      </Button>
                    )}
                    {po.status !== "cancelled" && po.status !== "received" && (
                      <Button size="sm" variant="ghost" onClick={() => statusMutation.mutate({ id: po.id, status: "cancelled" })} data-testid={`button-cancel-${po.id}`}>
                        Cancel
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => setDeleteId(po.id)} data-testid={`button-delete-po-${po.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {isOpen && (
                <CardContent>
                  <div className="rounded-md border divide-y">
                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-3 py-2 text-xs text-muted-foreground">
                      <span>Item</span><span className="text-right">Qty</span><span className="text-right">Unit cost</span><span className="text-right">Line total</span>
                    </div>
                    {po.lineItems.map((l) => (
                      <div key={l.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-3 py-2 text-sm" data-testid={`po-line-${l.id}`}>
                        <span className="truncate">{l.description}</span>
                        <span className="text-right tabular-nums">{l.quantity}</span>
                        <span className="text-right tabular-nums">{gbp(l.unitCost)}</span>
                        <span className="text-right tabular-nums font-medium">{gbp(l.quantity * l.unitCost)}</span>
                      </div>
                    ))}
                  </div>
                  {po.notes && <p className="text-sm text-muted-foreground mt-3">Notes: {po.notes}</p>}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* New PO dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Purchase Order</DialogTitle>
            <DialogDescription>Record a supplier purchase and its line items.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Supplier</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger data-testid="select-po-supplier"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_SUPPLIER}>None</SelectItem>
                    {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="po-date">Order date</Label>
                <Input id="po-date" type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} data-testid="input-po-date" />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                  <SelectTrigger data-testid="select-po-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open (on order)</SelectItem>
                    <SelectItem value="received">Received (in stock)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Line items</Label>
              <div className="space-y-2">
                {lines.map((line, idx) => (
                  <div key={idx} className="grid grid-cols-1 sm:grid-cols-[1.5fr_1fr_0.8fr_0.8fr_auto] gap-2 items-end rounded-md border p-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Item</Label>
                      <Select value={line.consumableId} onValueChange={(v) => updateLine(idx, { consumableId: v })}>
                        <SelectTrigger data-testid={`select-line-item-${idx}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={FREE_TEXT}>Free text…</SelectItem>
                          {consumables.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Description</Label>
                      <Input value={line.description} onChange={(e) => updateLine(idx, { description: e.target.value })} data-testid={`input-line-desc-${idx}`} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Qty</Label>
                      <Input type="number" min={1} value={line.quantity} onChange={(e) => updateLine(idx, { quantity: e.target.value })} data-testid={`input-line-qty-${idx}`} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Unit £</Label>
                      <Input type="number" min={0} step="0.01" value={line.unitCost} onChange={(e) => updateLine(idx, { unitCost: e.target.value })} data-testid={`input-line-cost-${idx}`} />
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))} disabled={lines.length === 1} data-testid={`button-remove-line-${idx}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={() => setLines((prev) => [...prev, { ...emptyLine }])} data-testid="button-add-line">
                <Plus className="h-4 w-4" />
                Add line
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="po-notes">Notes</Label>
              <Textarea id="po-notes" value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="input-po-notes" />
            </div>

            <div className="flex items-center justify-between border-t pt-3">
              <span className="text-sm text-muted-foreground">Order total</span>
              <span className="text-lg font-bold" data-testid="text-form-total">{gbp(formTotal)}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!formValid || createMutation.isPending} data-testid="button-save-po">
              {createMutation.isPending ? "Saving…" : "Create order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this purchase order?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes the order and its line items from spend history.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)} data-testid="button-confirm-delete-po">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================
// Suppliers tab
// ============================================================
const emptySupplier = { name: "", contactName: "", email: "", phone: "", notes: "" };

function SuppliersTab() {
  const { toast } = useToast();
  const { data: suppliers = [], isLoading } = useQuery<Supplier[]>({ queryKey: ["/api/purchasing/suppliers"] });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptySupplier });
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/purchasing/suppliers"] });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        contactName: form.contactName || null,
        email: form.email || "",
        phone: form.phone || null,
        notes: form.notes || null,
      };
      if (editingId) await apiRequest("PATCH", `/api/purchasing/suppliers/${editingId}`, payload);
      else await apiRequest("POST", "/api/purchasing/suppliers", payload);
    },
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
      toast({ title: editingId ? "Supplier updated" : "Supplier added" });
    },
    onError: (e: any) => toast({ title: "Couldn't save supplier", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/purchasing/suppliers/${id}`),
    onSuccess: () => {
      invalidate();
      setDeleteId(null);
      toast({ title: "Supplier deleted" });
    },
    onError: (e: any) => toast({ title: "Couldn't delete supplier", description: e.message, variant: "destructive" }),
  });

  const openAdd = () => { setEditingId(null); setForm({ ...emptySupplier }); setDialogOpen(true); };
  const openEdit = (s: Supplier) => {
    setEditingId(s.id);
    setForm({ name: s.name, contactName: s.contactName ?? "", email: s.email ?? "", phone: s.phone ?? "", notes: s.notes ?? "" });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{suppliers.length} supplier{suppliers.length === 1 ? "" : "s"}</p>
        <Button onClick={openAdd} data-testid="button-add-supplier">
          <Plus className="h-4 w-4" />
          Add Supplier
        </Button>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading…</p>}
      {!isLoading && suppliers.length === 0 && (
        <p className="text-sm text-muted-foreground" data-testid="text-no-suppliers">No suppliers yet.</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {suppliers.map((s) => (
          <Card key={s.id} data-testid={`card-supplier-${s.id}`}>
            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-3">
              <CardTitle className="text-base truncate">{s.name}</CardTitle>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button size="icon" variant="ghost" onClick={() => openEdit(s)} data-testid={`button-edit-supplier-${s.id}`}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => setDeleteId(s.id)} data-testid={`button-delete-supplier-${s.id}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {s.contactName && <p>{s.contactName}</p>}
              {s.email && <p className="text-muted-foreground">{s.email}</p>}
              {s.phone && <p className="text-muted-foreground">{s.phone}</p>}
              {s.notes && <p className="text-muted-foreground pt-1">{s.notes}</p>}
              {!s.contactName && !s.email && !s.phone && !s.notes && <p className="text-muted-foreground">No contact details</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Supplier" : "Add Supplier"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="sup-name">Name</Label>
              <Input id="sup-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="input-supplier-name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sup-contact">Contact name</Label>
              <Input id="sup-contact" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} data-testid="input-supplier-contact" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="sup-email">Email</Label>
                <Input id="sup-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="input-supplier-email" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sup-phone">Phone</Label>
                <Input id="sup-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="input-supplier-phone" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sup-notes">Notes</Label>
              <Textarea id="sup-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="input-supplier-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!form.name.trim() || saveMutation.isPending} data-testid="button-save-supplier">
              {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this supplier?</AlertDialogTitle>
            <AlertDialogDescription>Items linked to this supplier will simply lose the link.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)} data-testid="button-confirm-delete-supplier">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================
// Page
// ============================================================
export default function Purchasing() {
  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShoppingCart className="h-6 w-6" />
            Purchasing &amp; Consumables
          </h1>
          <p className="text-muted-foreground mt-1">
            Track supplier purchases, monitor spend, and manage reorder points for your consumables.
          </p>
        </div>

        <Tabs defaultValue="dashboard">
          <TabsList>
            <TabsTrigger value="dashboard" data-testid="tab-dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="consumables" data-testid="tab-consumables">Consumables</TabsTrigger>
            <TabsTrigger value="orders" data-testid="tab-orders">Purchase Orders</TabsTrigger>
            <TabsTrigger value="suppliers" data-testid="tab-suppliers">Suppliers</TabsTrigger>
          </TabsList>
          <TabsContent value="dashboard" className="mt-6"><DashboardTab /></TabsContent>
          <TabsContent value="consumables" className="mt-6"><ConsumablesTab /></TabsContent>
          <TabsContent value="orders" className="mt-6"><PurchaseOrdersTab /></TabsContent>
          <TabsContent value="suppliers" className="mt-6"><SuppliersTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
