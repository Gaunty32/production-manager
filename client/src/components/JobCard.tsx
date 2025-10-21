import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle2, XCircle, Package, AlertCircle, Clock, Layers } from "lucide-react";
import { format, isPast, isToday } from "date-fns";
import { calculateProductionMetrics } from "@shared/machines";
import type { JobLineItem, Customer } from "@shared/schema";

interface JobCardProps {
  job: {
    id: string;
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
  customer: Customer;
  onClick: () => void;
}

const JOB_TYPE_LABELS: Record<string, string> = {
  embroidery: "Embroidery",
  print: "Print",
  bagging: "Bagging",
  other: "Other",
};

export function JobCard({ job, customer, onClick }: JobCardProps) {
  const isOverdue = job.requiredDispatchDate && isPast(job.requiredDispatchDate) && !isToday(job.requiredDispatchDate);
  const isDueToday = job.requiredDispatchDate && isToday(job.requiredDispatchDate);
  
  // Check if all line items have logo approved
  const allLogosApproved = job.lineItems && job.lineItems.length > 0 
    ? job.lineItems.every(item => item.logoApproved === true)
    : false;
  
  // Calculate weighted average stitch count from line items
  const weightedStitchCount = job.lineItems && job.lineItems.length > 0
    ? Math.round(
        job.lineItems.reduce((sum, item) => sum + (item.stitchCount * item.quantity), 0) / 
        Math.max(job.quantity, 1)
      )
    : 0;
  
  // Calculate production metrics
  const metrics = calculateProductionMetrics(job.quantity, weightedStitchCount, job.machineId);
  
  // Calculate completed items
  const completedItems = job.lineItems && job.lineItems.length > 0
    ? job.lineItems.reduce((sum, item) => item.completed ? sum + item.quantity : sum, 0)
    : 0;
  
  // Get primary job type from first line item
  const primaryJobType = job.lineItems && job.lineItems.length > 0
    ? job.lineItems[0].jobType.toLowerCase()
    : "other";
  
  // Get unique pastel color for customer
  const getCustomerColor = (customerId: string) => {
    const colors = [
      "hsl(210, 100%, 95%)", // Light blue
      "hsl(120, 100%, 95%)", // Light green
      "hsl(330, 100%, 95%)", // Light pink
      "hsl(50, 100%, 95%)",  // Light yellow
      "hsl(280, 100%, 95%)", // Light purple
      "hsl(30, 100%, 95%)",  // Light orange
    ];
    const hash = customerId.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  const customerColor = getCustomerColor(customer.id);

  return (
    <Card
      className="hover-elevate active-elevate-2 cursor-pointer transition-all"
      style={{
        borderLeft: `4px solid ${isOverdue ? 'hsl(var(--destructive))' : isDueToday ? 'hsl(var(--warning))' : 'transparent'}`,
        backgroundColor: customerColor,
      }}
      onClick={onClick}
      data-testid={`card-job-${job.id}`}
    >
      <div className="p-4 space-y-3">
        {/* Header: Customer & Job Name */}
        <div className="space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground truncate" data-testid={`text-customer-${job.id}`}>
                {customer.name}
              </h3>
              <p className="text-sm text-muted-foreground truncate" data-testid={`text-jobname-${job.id}`}>
                {job.jobName}
              </p>
            </div>
            
            {/* Job Type Badge */}
            <Badge variant="secondary" className="shrink-0">
              {JOB_TYPE_LABELS[primaryJobType] || primaryJobType}
            </Badge>
          </div>
        </div>

        {/* Dispatch Date & Status Indicators */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className={`text-sm font-medium ${isOverdue ? 'text-destructive' : isDueToday ? 'text-warning' : 'text-foreground'}`}>
              {job.requiredDispatchDate ? format(job.requiredDispatchDate, "MMM dd, yyyy") : "No date set"}
            </span>
          </div>

          {/* Status Badges */}
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 no-default-active-elevate"
                  onClick={(e) => e.stopPropagation()}
                  aria-label={allLogosApproved ? "Logo approved" : "Logo pending approval"}
                  data-testid={`button-logo-status-${job.id}`}
                >
                  <Badge variant={allLogosApproved ? "default" : "secondary"} className="h-6 px-2">
                    {allLogosApproved ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <XCircle className="h-3 w-3" />
                    )}
                  </Badge>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Logo: {allLogosApproved ? "Approved" : "Pending"}</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 no-default-active-elevate"
                  onClick={(e) => e.stopPropagation()}
                  aria-label={job.goodsReceived ? "Goods received" : "Goods not received"}
                  data-testid={`button-goods-status-${job.id}`}
                >
                  <Badge variant={job.goodsReceived ? "default" : "secondary"} className="h-6 px-2">
                    {job.goodsReceived ? (
                      <Package className="h-3 w-3" />
                    ) : (
                      <AlertCircle className="h-3 w-3" />
                    )}
                  </Badge>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Goods: {job.goodsReceived ? "Received" : "Not Received"}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Production Metrics & Quantity */}
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/50">
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Layers className="h-3 w-3" />
              <span className="text-xs">Quantity</span>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-auto p-0 font-semibold text-foreground hover:bg-transparent no-default-active-elevate"
                  onClick={(e) => e.stopPropagation()}
                  data-testid={`button-quantity-${job.id}`}
                >
                  {completedItems}/{job.quantity}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-xs space-y-1">
                  {job.lineItems && job.lineItems.map((item, idx) => (
                    <div key={idx} className="flex justify-between gap-4">
                      <span>{item.description}</span>
                      <span className="font-mono">{item.quantity}</span>
                    </div>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span className="text-xs">Production</span>
            </div>
            {metrics ? (
              <div className="text-xs space-y-0.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Runs:</span>
                  <span className="font-medium">{metrics.runs}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Time/Run:</span>
                  <span className="font-semibold">{metrics.timePerRunMinutes}min</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total:</span>
                  <span className="font-medium">{metrics.totalTimeMinutes}min</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">N/A</p>
            )}
          </div>
        </div>

        {/* PO Number & Notes (if available) */}
        {(job.poNumber || job.notes) && (
          <div className="pt-2 border-t border-border/50 text-xs text-muted-foreground space-y-1">
            {job.poNumber && (
              <div className="flex items-center gap-1">
                <span className="font-medium">PO:</span>
                <span>{job.poNumber}</span>
              </div>
            )}
            {job.notes && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    className="h-auto p-0 text-xs text-muted-foreground hover:bg-transparent no-default-active-elevate truncate w-full text-left"
                    onClick={(e) => e.stopPropagation()}
                  >
                    📝 {job.notes}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs max-w-xs">{job.notes}</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
