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
import { formatPrice, getPrice } from "@shared/pricing";
import type { JobLineItem, Customer } from "@shared/schema";

interface LineItemRowProps {
  jobId: string;
  jobNumber: number | null;
  customerId: string;
  customerName: string;
  jobName: string;
  poNumber: string | null;
  totalJobQuantity: number;
  lineItemCount: number;
  lineItemIndex: number;
  lineItem: JobLineItem;
  goodsReceived: Date | null;
  requiredDispatchDate: Date | null;
  completedOnTime: boolean | null;
  notes: string | null;
  allLogosApproved: boolean;
  customer?: Customer;
  showPrices?: boolean;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onPrintWorksheet?: (id: string) => void;
  isCompleted?: boolean;
}

export function LineItemRow({
  jobId,
  jobNumber,
  customerId,
  customerName,
  jobName,
  poNumber,
  totalJobQuantity,
  lineItemCount,
  lineItemIndex,
  lineItem,
  goodsReceived,
  requiredDispatchDate,
  completedOnTime,
  notes,
  allLogosApproved,
  customer,
  showPrices = true,
  onEdit,
  onDelete,
  onPrintWorksheet,
  isCompleted = false,
}: LineItemRowProps) {
  const isOverdue = requiredDispatchDate && isPast(requiredDispatchDate) && !isToday(requiredDispatchDate);
  const isDueToday = requiredDispatchDate && isToday(requiredDispatchDate);
  const isFirstLineItem = lineItemIndex === 0;
  const hasGoodsReceived = !!goodsReceived;

  // Calculate production metrics for this specific line item
  const metrics = calculateProductionMetrics(lineItem.quantity, lineItem.stitchCount, lineItem.machineId);

  // Calculate line item price with error handling
  const lineItemPrice = customer ? (() => {
    const pricingTable = customer.pricingTable2026 ? "2026" : customer.pricingTable2025 ? "2025" : null;
    if (!pricingTable) return null;
    try {
      // Check if it's a flat-rate job type
      if (lineItem.jobType === "Print Initials/Name" || lineItem.jobType === "Embroidery Initials/Name") {
        return lineItem.quantity * 2.5; // £2.50 per item
      } else {
        const pricing = getPrice(lineItem.quantity, lineItem.stitchCount, pricingTable);
        return pricing.unitPrice * lineItem.quantity;
      }
    } catch (error) {
      console.error("Failed to calculate line item price:", error);
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
        !isOverdue && getCustomerColorClasses(customerId),
        // Due today adds amber ring accent (augments customer colors, doesn't replace)
        isDueToday && !isOverdue && "ring-2 ring-inset ring-amber-400 dark:ring-amber-600",
        // Add subtle top border for non-first line items to show grouping
        !isFirstLineItem && "border-t border-border/50"
      )}
      data-testid={`row-line-item-${lineItem.id}`}
    >
      {/* Customer - only show on first line item */}
      <td className="py-2 px-3">
        {isFirstLineItem ? (
          customerName
        ) : (
          <span className="text-muted-foreground/50">↳</span>
        )}
      </td>

      {/* Job - show full info on first line item, compact on others */}
      <td className="py-2 px-3">
        {isFirstLineItem ? (
          <div className="flex items-center gap-2">
            <span className="truncate">
              {jobNumber && <span className="font-semibold text-primary">#{jobNumber}</span>}
              {jobNumber && " - "}
              {jobName}
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
                      data-testid={`indicator-logo-${jobId}`}
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
                      data-testid={`indicator-date-${jobId}`}
                    >
                      {hasGoodsReceived ? <Package className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                      <span className="sr-only">Goods received status</span>
                    </Badge>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">
                    {hasGoodsReceived && goodsReceived ? `Goods Received: ${format(goodsReceived, "PPP")}` : "Goods not yet received"}
                  </p>
                </TooltipContent>
              </Tooltip>

              {notes && notes.trim() && (
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
                        data-testid={`button-notes-${jobId}`}
                      >
                        <StickyNote className="h-3 w-3" />
                        <span className="sr-only">Notes</span>
                      </Badge>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent 
                    side="top" 
                    className="max-w-md whitespace-pre-wrap"
                    data-testid={`tooltip-notes-${jobId}`}
                  >
                    <div className="space-y-1">
                      <p className="font-semibold text-xs">Notes:</p>
                      <p className="text-sm">{notes}</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground/50">↳</span>
            <span className="text-sm text-muted-foreground">{lineItem.description || `Line item ${lineItemIndex + 1}`}</span>
          </div>
        )}
      </td>

      {/* PO Number - only show on first line item */}
      <td className="py-2 px-3 font-mono">
        {isFirstLineItem ? (poNumber || "-") : ""}
      </td>

      {/* Line Item Quantity */}
      <td className="py-2 px-3 font-mono" data-testid={`text-quantity-${lineItem.id}`}>
        <div className="flex flex-col gap-0.5">
          <span>{lineItem.quantity}</span>
          {lineItem.description && (
            <span className="text-xs text-muted-foreground">{lineItem.description}</span>
          )}
        </div>
      </td>

      {/* Machine - per line item */}
      <td className="py-2 px-3">
        <MachineBadge machineId={lineItem.machineId} />
      </td>

      {/* Production - per line item */}
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

      {/* Price - per line item */}
      {showPrices && (
        <td className="py-2 px-3 font-mono whitespace-nowrap">
          {lineItemPrice ? formatPrice(lineItemPrice) : <span className="text-muted-foreground">-</span>}
        </td>
      )}

      {/* Date Required - only show on first line item */}
      <td className="py-2 px-3 font-mono whitespace-nowrap">
        {isFirstLineItem ? (requiredDispatchDate ? format(requiredDispatchDate, "PP") : "-") : ""}
      </td>

      {/* Status - only show on first line item */}
      <td className="py-2 px-3">
        {isFirstLineItem && <StatusBadge status={completedOnTime} type="ontime" />}
      </td>

      {/* Actions - only show on first line item */}
      <td className="py-2 px-3">
        {isFirstLineItem && (
          isCompleted ? (
            <span className="text-sm" data-testid={`text-invoice-ref-${jobId}`}>
              -
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
                      onClick={() => onPrintWorksheet(jobId)}
                      data-testid={`button-print-worksheet-${jobId}`}
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
                onClick={() => onEdit(jobId)}
                data-testid={`button-edit-${jobId}`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onDelete(jobId)}
                data-testid={`button-delete-${jobId}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )
        )}
      </td>
    </tr>
  );
}
