import { format, isPast, isToday } from "date-fns";
import { Pencil, Trash2, StickyNote, CheckCircle2, XCircle, Package, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MachineBadge } from "./MachineBadge";
import { StatusBadge } from "./StatusBadge";
import { cn } from "@/lib/utils";
import { calculateProductionMetrics, formatTimeDisplay } from "@shared/machines";
import { getCustomerColorClasses } from "@shared/colors";
import { calculateJobPrice, formatPrice, getPrice } from "@shared/pricing";
import type { JobLineItem, Customer } from "@shared/schema";

interface JobRowProps {
  job: {
    id: string;
    jobNumber: number | null;
    customerId: string;
    customerName: string;
    jobName: string;
    poNumber: string | null;
    quantity: number;
    goodsReceived: Date | null;
    requiredDispatchDate: Date | null;
    completedOnTime: boolean | null;
    completedByName: string | null;
    machineId: number | null;
    notes: string | null;
    lineItems?: JobLineItem[];
    invoiceReference?: string | null;
  };
  customer?: Customer;
  showPrices?: boolean;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onPrintWorksheet?: (id: string) => void;
  isCompleted?: boolean;
}

export function JobRow({ job, customer, showPrices = true, onEdit, onDelete, onPrintWorksheet, isCompleted = false }: JobRowProps) {
  const isOverdue = job.requiredDispatchDate && isPast(job.requiredDispatchDate) && !isToday(job.requiredDispatchDate);
  const isDueToday = job.requiredDispatchDate && isToday(job.requiredDispatchDate);
  
  // Check if all line items have logo approved
  const allLogosApproved = job.lineItems && job.lineItems.length > 0 
    ? job.lineItems.every(item => item.logoApproved === true)
    : false;
  
  // Check if date received exists
  const hasGoodsReceived = !!job.goodsReceived;
  
  // Calculate weighted average stitch count from line items
  const weightedStitchCount = job.lineItems && job.lineItems.length > 0
    ? Math.round(
        job.lineItems.reduce((sum, item) => sum + (item.stitchCount * item.quantity), 0) / 
        Math.max(job.quantity, 1)
      )
    : 0;
  
  const metrics = calculateProductionMetrics(job.quantity, weightedStitchCount, job.machineId);
  
  // Calculate job price with error handling
  const jobPrice = customer && job.lineItems && job.lineItems.length > 0 ? (() => {
    const pricingTable = customer.pricingTable2026 ? "2026" : customer.pricingTable2025 ? "2025" : null;
    if (!pricingTable) return null;
    try {
      return calculateJobPrice(job.lineItems, pricingTable);
    } catch (error) {
      console.error("Failed to calculate job price:", error);
      return null;
    }
  })() : null;

  return (
    <tr
      className={cn(
        "hover-elevate",
        // Overdue gets red background
        isOverdue && "bg-red-100 dark:bg-red-950/30",
        // Customer color coding (only if not overdue)
        !isOverdue && getCustomerColorClasses(job.customerId),
        // Due today adds amber ring accent (augments customer colors, doesn't replace)
        isDueToday && !isOverdue && "ring-2 ring-inset ring-amber-400 dark:ring-amber-600"
      )}
      data-testid={`row-job-${job.id}`}
    >
      <td className="py-2 px-3">{job.customerName}</td>
      <td className="py-2 px-3">
        <div className="flex items-center gap-2">
          <span className="truncate">
            {job.jobNumber && <span className="font-semibold text-primary">#{job.jobNumber}</span>}
            {job.jobNumber && " - "}
            {job.jobName}
          </span>
          <div className="flex items-center gap-1">
            {/* Compact status badges */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="inline-flex focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-sm"
                  aria-label={allLogosApproved ? "All logos approved" : "Logos not approved"}
                  tabIndex={0}
                >
                  <Badge
                    variant={allLogosApproved ? "default" : "destructive"}
                    className="h-5 px-1.5 text-xs gap-0.5 cursor-help"
                    data-testid={`indicator-logo-${job.id}`}
                  >
                    {allLogosApproved ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                    <span className="sr-only">Logo status</span>
                  </Badge>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">
                  {allLogosApproved ? "All logos approved ✓" : "Logos not approved"}
                </p>
              </TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="inline-flex focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-sm"
                  aria-label={hasGoodsReceived ? "Goods received recorded" : "Goods not yet received"}
                  tabIndex={0}
                >
                  <Badge
                    variant={hasGoodsReceived ? "default" : "destructive"}
                    className="h-5 px-1.5 text-xs gap-0.5 cursor-help"
                    data-testid={`indicator-date-${job.id}`}
                  >
                    {hasGoodsReceived ? <Package className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                    <span className="sr-only">Goods received status</span>
                  </Badge>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">
                  {hasGoodsReceived && job.goodsReceived ? `Goods Received: ${format(job.goodsReceived, "PPP")}` : "Goods not yet received"}
                </p>
              </TooltipContent>
            </Tooltip>
            
            {job.notes && job.notes.trim() && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="inline-flex focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-sm"
                    aria-label="View notes"
                    tabIndex={0}
                  >
                    <Badge
                      variant="outline"
                      className="h-5 px-1.5 text-xs gap-0.5 cursor-help"
                      data-testid={`button-notes-${job.id}`}
                    >
                      <StickyNote className="h-3 w-3" />
                      <span className="sr-only">Notes</span>
                    </Badge>
                  </button>
                </TooltipTrigger>
                <TooltipContent 
                  side="top" 
                  className="max-w-md whitespace-pre-wrap"
                  data-testid={`tooltip-notes-${job.id}`}
                >
                  <div className="space-y-1">
                    <p className="font-semibold text-xs">Notes:</p>
                    <p className="text-sm">{job.notes}</p>
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </td>
      <td className="py-2 px-3 font-mono">{job.poNumber}</td>
      <td className="py-2 px-3 font-mono">
        {job.lineItems && job.lineItems.length > 0 ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button 
                className="inline-flex items-center gap-1 text-left font-mono hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-sm px-1 -mx-1"
                aria-label={`View line items breakdown for ${job.quantity} total items`}
                data-testid={`button-quantity-${job.id}`}
              >
                <span>{job.quantity}</span>
                {job.lineItems.length > 1 && <span className="text-muted-foreground">({job.lineItems.length} items)</span>}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-sm">
              <div className="space-y-1">
                <p className="font-semibold text-xs">Line Items:</p>
                {job.lineItems.map((item, idx) => {
                  // Calculate unit price for this line item if customer has pricing table
                  const pricingTable = customer?.pricingTable2026 ? "2026" : customer?.pricingTable2025 ? "2025" : null;
                  let unitPrice: string | null = null;
                  
                  if (pricingTable) {
                    try {
                      // Check if it's a flat-rate job type
                      if (item.jobType === "Print Initials/Name" || item.jobType === "Embroidery Initials/Name") {
                        unitPrice = "£2.50";
                      } else {
                        const pricing = getPrice(item.quantity, item.stitchCount, pricingTable);
                        unitPrice = formatPrice(pricing.unitPrice);
                      }
                    } catch (error) {
                      unitPrice = null;
                    }
                  }
                  
                  return (
                    <div key={item.id} className="text-sm space-y-0.5">
                      <div className="flex justify-between gap-3">
                        <span>{item.description || `Item ${idx + 1}`}</span>
                        <span className="font-mono">Qty: {item.quantity}</span>
                      </div>
                      <div className="text-xs text-muted-foreground flex justify-between gap-3">
                        <span>Stitches: {item.stitchCount.toLocaleString()}</span>
                        <span>{item.logoApproved ? "Logo: Approved" : "Logo: Pending"}</span>
                      </div>
                      {showPrices && unitPrice && (
                        <div className="text-xs text-muted-foreground">
                          Unit Price: {unitPrice}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </TooltipContent>
          </Tooltip>
        ) : (
          <span data-testid={`text-quantity-${job.id}`}>{job.quantity}</span>
        )}
      </td>
      <td className="py-2 px-3">
        <MachineBadge machineId={job.machineId} />
      </td>
      <td className="py-2 px-3">
        {metrics ? (
          <div className="font-mono text-xs space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground w-12">Runs:</span>
              <span>{metrics.runs}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground w-12">Time:</span>
              <span>{metrics.timePerRunMinutes}m</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground w-12">Total:</span>
              <span className="font-semibold">{formatTimeDisplay(metrics.totalTimeMinutes)}</span>
            </div>
          </div>
        ) : (
          <span className="text-muted-foreground text-sm">-</span>
        )}
      </td>
      <td className="py-2 px-3 font-mono whitespace-nowrap">
        {showPrices ? (
          jobPrice ? formatPrice(jobPrice.totalPrice) : <span className="text-muted-foreground">-</span>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </td>
      <td className="py-2 px-3 font-mono whitespace-nowrap">{job.requiredDispatchDate ? format(job.requiredDispatchDate, "PP") : "-"}</td>
      <td className="py-2 px-3">
        <StatusBadge status={job.completedOnTime} type="ontime" />
      </td>
      <td className="py-2 px-3">{job.completedByName || "-"}</td>
      <td className="py-2 px-3">
        {isCompleted ? (
          <span className="text-sm" data-testid={`text-invoice-ref-${job.id}`}>
            {job.invoiceReference || "-"}
          </span>
        ) : (
          <div className="flex gap-1">
            {onPrintWorksheet && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onPrintWorksheet(job.id)}
                    data-testid={`button-print-worksheet-${job.id}`}
                  >
                    <Printer className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Print production worksheet</p>
                </TooltipContent>
              </Tooltip>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onEdit(job.id)}
              data-testid={`button-edit-${job.id}`}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onDelete(job.id)}
              data-testid={`button-delete-${job.id}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </td>
    </tr>
  );
}
