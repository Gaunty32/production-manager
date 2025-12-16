import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Clock, Package, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { JobLineItem, Staff, ProductionEntry } from "@shared/schema";

interface RecordProductionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lineItem: JobLineItem;
  jobName: string;
  currentUserId?: string;
}

export function RecordProductionDialog({
  open,
  onOpenChange,
  lineItem,
  jobName,
  currentUserId,
}: RecordProductionDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [quantityCompleted, setQuantityCompleted] = useState("");
  const [productionTimeMinutes, setProductionTimeMinutes] = useState("");
  const [selectedStaffId, setSelectedStaffId] = useState(currentUserId || "");
  const [workDate, setWorkDate] = useState(format(new Date(), "yyyy-MM-dd"));
  
  const { data: staff = [] } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
  });
  
  const { data: existingEntries = [] } = useQuery<ProductionEntry[]>({
    queryKey: ["/api/line-items", lineItem.id, "production-entries"],
    enabled: open,
  });
  
  const { data: progress } = useQuery<{ totalQuantityCompleted: number; totalMinutes: number }>({
    queryKey: ["/api/line-items", lineItem.id, "progress"],
    enabled: open,
  });
  
  const createEntryMutation = useMutation({
    mutationFn: async (data: { lineItemId: string; staffId: string; quantityCompleted: number; productionTimeMinutes: number; workDate: string }) => {
      return apiRequest("POST", "/api/production-entries", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/line-items", lineItem.id, "production-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/line-items", lineItem.id, "progress"] });
      queryClient.invalidateQueries({ queryKey: ["/api/production-entries"] });
      toast({ title: "Production recorded successfully" });
      setQuantityCompleted("");
      setProductionTimeMinutes("");
    },
    onError: (error: Error) => {
      toast({ title: "Failed to record production", description: error.message, variant: "destructive" });
    },
  });
  
  const deleteEntryMutation = useMutation({
    mutationFn: async (entryId: string) => {
      return apiRequest("DELETE", `/api/production-entries/${entryId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/line-items", lineItem.id, "production-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/line-items", lineItem.id, "progress"] });
      queryClient.invalidateQueries({ queryKey: ["/api/production-entries"] });
      toast({ title: "Entry deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete entry", description: error.message, variant: "destructive" });
    },
  });
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const qty = parseInt(quantityCompleted);
    const time = parseInt(productionTimeMinutes);
    
    if (isNaN(qty) || qty <= 0) {
      toast({ title: "Please enter a valid quantity", variant: "destructive" });
      return;
    }
    
    if (isNaN(time) || time <= 0) {
      toast({ title: "Please enter a valid production time", variant: "destructive" });
      return;
    }
    
    if (!selectedStaffId) {
      toast({ title: "Please select a staff member", variant: "destructive" });
      return;
    }
    
    const totalCompleted = (progress?.totalQuantityCompleted || 0) + qty;
    if (totalCompleted > lineItem.quantity) {
      toast({ 
        title: "Quantity exceeds remaining", 
        description: `Only ${lineItem.quantity - (progress?.totalQuantityCompleted || 0)} items remaining on this line item`,
        variant: "destructive" 
      });
      return;
    }
    
    createEntryMutation.mutate({
      lineItemId: lineItem.id,
      staffId: selectedStaffId,
      quantityCompleted: qty,
      productionTimeMinutes: time,
      workDate,
    });
  };
  
  const remainingQty = lineItem.quantity - (progress?.totalQuantityCompleted || 0);
  const staffMember = staff.find(s => s.id === selectedStaffId);
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-5 w-5" />
            Record Partial Production
          </DialogTitle>
          <DialogDescription>
            Record daily work progress on: {jobName} - {lineItem.description || "Line Item"}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="bg-muted p-3 rounded-lg space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Quantity:</span>
              <span className="font-medium">{lineItem.quantity.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Completed So Far:</span>
              <span className="font-medium">{(progress?.totalQuantityCompleted || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Remaining:</span>
              <span className="font-semibold text-primary">{remainingQty.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Time Logged:</span>
              <span className="font-medium">{(progress?.totalMinutes || 0)} mins</span>
            </div>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="workDate">Work Date</Label>
                <Input
                  id="workDate"
                  type="date"
                  value={workDate}
                  onChange={(e) => setWorkDate(e.target.value)}
                  data-testid="input-work-date"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="staffId">Staff Member</Label>
                <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
                  <SelectTrigger data-testid="select-staff">
                    <SelectValue placeholder="Select staff" />
                  </SelectTrigger>
                  <SelectContent>
                    {staff.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantity" className="flex items-center gap-1">
                  <Package className="h-3.5 w-3.5" />
                  Quantity Completed
                </Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  max={remainingQty}
                  value={quantityCompleted}
                  onChange={(e) => setQuantityCompleted(e.target.value)}
                  placeholder={`Max ${remainingQty}`}
                  data-testid="input-quantity-completed"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="time" className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  Production Time (mins)
                </Label>
                <Input
                  id="time"
                  type="number"
                  min="1"
                  value={productionTimeMinutes}
                  onChange={(e) => setProductionTimeMinutes(e.target.value)}
                  placeholder="Minutes worked"
                  data-testid="input-production-time"
                />
              </div>
            </div>
            
            <Button 
              type="submit" 
              className="w-full"
              disabled={createEntryMutation.isPending}
              data-testid="button-submit-production"
            >
              {createEntryMutation.isPending ? "Recording..." : "Record Production"}
            </Button>
          </form>
          
          {existingEntries.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Previous Entries</h4>
              <div className="max-h-40 overflow-y-auto space-y-2">
                {existingEntries.map((entry) => {
                  const entryStaff = staff.find(s => s.id === entry.staffId);
                  return (
                    <div 
                      key={entry.id} 
                      className="flex items-center justify-between p-2 bg-muted/50 rounded text-sm"
                      data-testid={`entry-${entry.id}`}
                    >
                      <div className="space-y-0.5">
                        <div className="font-medium">
                          {entry.quantityCompleted} items in {entry.productionTimeMinutes} mins
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {entryStaff?.name || "Unknown"} - {format(new Date(entry.workDate), "PP")}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => deleteEntryMutation.mutate(entry.id)}
                        disabled={deleteEntryMutation.isPending}
                        data-testid={`button-delete-entry-${entry.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
