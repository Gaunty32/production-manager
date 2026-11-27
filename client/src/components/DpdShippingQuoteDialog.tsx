import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Calculator, CheckCircle2, Loader2, Truck } from "lucide-react";
import type { Job } from "@shared/schema";
import {
  DPD_REGION_LABELS,
  calculateDpdShippingQuote,
  dpdServicesForRegion,
  dpdQuoteInputSchema,
  inspectDpdPostcode,
  normaliseDpdPostcode,
  type DpdQuoteInput,
  type DpdRegion,
  type DpdShippingQuote,
} from "@shared/dpd-shipping-quote";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type QuoteJob = Job & { shippingQuote?: DpdShippingQuote | null };

interface DpdShippingQuoteDialogProps {
  job: Job;
  initialPostcode?: string;
  onClose: () => void;
  onSaved: () => void;
}

const money = (value: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);

export function DpdShippingQuoteDialog({ job, initialPostcode, onClose, onSaved }: DpdShippingQuoteDialogProps) {
  const { toast } = useToast();
  const snapshot = (job as QuoteJob).shippingQuote || null;
  const [postcode, setPostcode] = useState(snapshot?.input.postcode || initialPostcode || "");
  const [region, setRegion] = useState<DpdRegion | "">(snapshot?.input.region || "");
  const [service, setService] = useState<"next_day" | "two_day" | "">(snapshot?.input.service || "");
  const [weight, setWeight] = useState(snapshot ? String(snapshot.input.totalWeightKg) : "");
  const [dispatchDate, setDispatchDate] = useState(snapshot?.input.dispatchDate || "");
  const [carriage, setCarriage] = useState(snapshot ? String(snapshot.input.carriagePerParcel) : "");
  const [extraCharges, setExtraCharges] = useState(snapshot ? String(snapshot.input.extraCharges) : "0");
  const [congestion, setCongestion] = useState(snapshot?.input.congestion || false);
  const [tariffConfirmed, setTariffConfirmed] = useState(snapshot?.input.confirmedTariff || false);
  const [assumptionsConfirmed, setAssumptionsConfirmed] = useState(false);
  const [quote, setQuote] = useState<DpdShippingQuote | null>(snapshot);
  const [showSavedApproval, setShowSavedApproval] = useState(Boolean(snapshot?.approvedAt));
  const [isCalculating, setIsCalculating] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [error, setError] = useState("");
  const firstInputEffect = useRef(true);

  const postcodeCheck = useMemo(() => inspectDpdPostcode(postcode), [postcode]);
  const availableServices = region ? dpdServicesForRegion(region) : [];
  const shipmentReadyForApproval = Boolean(job.dhlTrackingNumber && job.shippingMethod);
  const quoteIsCurrent = Boolean(quote &&
    quote.input.postcode === normaliseDpdPostcode(postcode) &&
    quote.input.region === region &&
    quote.input.service === service &&
    quote.input.totalWeightKg === Number(weight) &&
    quote.input.dispatchDate === dispatchDate &&
    quote.input.carriagePerParcel === Number(carriage) &&
    quote.input.extraCharges === Number(extraCharges) &&
    quote.input.congestion === congestion &&
    quote.input.confirmedTariff === tariffConfirmed &&
    quote.input.packageCount === Number(job.packageCount));
  const quoteValues = (): DpdQuoteInput => ({
    postcode,
    region: (region || "uk") as DpdRegion,
    service: service as DpdQuoteInput["service"],
    packageType: "boxes",
    packageCount: Number(job.packageCount),
    totalWeightKg: Number(weight),
    dispatchDate,
    carriagePerParcel: Number(carriage),
    extraCharges: Number(extraCharges),
    congestion,
    confirmedTariff: tariffConfirmed,
  });

  useEffect(() => {
    if (firstInputEffect.current) {
      firstInputEffect.current = false;
      return;
    }
    setQuote(null);
    setShowSavedApproval(false);
    setError("");
    setAssumptionsConfirmed(false);
  }, [postcode, region, service, weight, dispatchDate, carriage, extraCharges, congestion, tariffConfirmed]);

  async function calculate() {
    setError("");
    setQuote(null);
    try {
      if (!postcodeCheck.valid) throw new Error(postcodeCheck.warning || "Enter a valid delivery postcode.");
      if (postcodeCheck.region && region !== postcodeCheck.region) throw new Error("Choose the tariff shown for this postcode.");
      if (!region) throw new Error("Choose and confirm the destination tariff.");
      if (!service) throw new Error("Select the actual DPD service used for this shipment.");
      if (!availableServices.includes(service)) throw new Error("Choose a service available for this destination.");
      const input = dpdQuoteInputSchema.parse(quoteValues());
      if (input.totalWeightKg > Number(job.packageCount) * 30) throw new Error("The total weight exceeds 30kg per box.");
      setIsCalculating(true);
      const response = await apiRequest("POST", "/api/dpd/shipping-quote", { input });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not calculate this DPD estimate.");
      setQuote(result as DpdShippingQuote);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not calculate this DPD estimate.");
    } finally {
      setIsCalculating(false);
    }
  }

  async function approve() {
    if (!quote || !quoteIsCurrent || !assumptionsConfirmed || isApproving) return;
    setError("");
    setIsApproving(true);
    try {
      const response = await apiRequest("POST", `/api/jobs/${job.id}/dpd-shipping-quote`, {
        input: quote.input,
        approved: true,
        confirmedDpd: true,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not approve this estimate.");
      await queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: "DPD estimate approved", description: "The consolidated customer charge has been saved. No label was booked." });
      onSaved();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not approve this estimate.");
    } finally {
      setIsApproving(false);
    }
  }

  const comparisonQuotes = quote ? [quote.input.region]
    .flatMap(candidateRegion => dpdServicesForRegion(candidateRegion).map(candidateService => {
      try {
        if (candidateRegion === quote.input.region && candidateService === quote.input.service) return null;
        const alternative = calculateDpdShippingQuote({ ...quote.input, region: candidateRegion, service: candidateService });
        return { label: `${DPD_REGION_LABELS[candidateRegion]} · ${alternative.serviceLabel}`, cost: alternative.estimatedDpdCost };
      } catch {
        return null;
      }
    }))
    .filter((entry): entry is { label: string; cost: number } => Boolean(entry))
    .sort((a, b) => a.cost - b.cost)
    .slice(0, 1) : [];

  return (
    <Dialog open onOpenChange={open => { if (!open && !isApproving && !isCalculating) onClose(); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Truck className="h-5 w-5" />DPD shipping estimate</DialogTitle>
          <DialogDescription>
            {job.jobNumber ? `Job #${job.jobNumber}` : `Job ${job.id.slice(0, 8)}`} · {job.jobName} · {job.packageCount} boxes
            {job.dhlTrackingNumber ? ` · Tracking ${job.dhlTrackingNumber}` : ""}
            {job.shippingMethod ? ` · Method ${job.shippingMethod}` : ""}
            . Estimate only; this does not book a label, email the customer or dispatch the job.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {snapshot?.approvedAt && showSavedApproval && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>Estimate approved {new Date(snapshot.approvedAt).toLocaleDateString("en-GB")} · saved customer charge {money(snapshot.customerCharge)} before VAT.</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="dpd-postcode">Actual recipient postcode</Label>
              <Input id="dpd-postcode" value={postcode} onChange={event => { setPostcode(event.target.value.toUpperCase()); setTariffConfirmed(false); }} placeholder="e.g. LS1 4AP" autoComplete="postal-code" />
              {postcode.length > 0 && postcodeCheck.warning && <p className={`text-sm ${postcodeCheck.valid ? "text-amber-700" : "text-destructive"}`}>{postcodeCheck.warning}</p>}
            </div>
            <div className="space-y-2">
              <Label>Destination tariff</Label>
              <Select value={region} onValueChange={value => {
                const selectedRegion = value as DpdRegion;
                setRegion(selectedRegion);
                setTariffConfirmed(false);
                if (service && !dpdServicesForRegion(selectedRegion).includes(service)) setService("");
              }}>
                <SelectTrigger><SelectValue placeholder="Select confirmed tariff" /></SelectTrigger>
                <SelectContent>{(Object.keys(DPD_REGION_LABELS) as DpdRegion[]).map(key => <SelectItem key={key} value={key}>{DPD_REGION_LABELS[key]}</SelectItem>)}</SelectContent>
              </Select>
              {postcodeCheck.region && region !== postcodeCheck.region && <p className="text-sm text-destructive">This postcode requires {DPD_REGION_LABELS[postcodeCheck.region]}.</p>}
              {postcodeCheck.valid && !postcodeCheck.region && postcodeCheck.warning && <p className="text-xs text-muted-foreground">Verify the applicable account tariff before selecting it.</p>}
            </div>
            <div className="space-y-2">
              <Label>Actual DPD service used</Label>
              <Select value={service} onValueChange={value => setService(value as "next_day" | "two_day")} disabled={!region}>
                <SelectTrigger><SelectValue placeholder="Select service actually used" /></SelectTrigger>
                <SelectContent>
                  {availableServices.includes("next_day") && <SelectItem value="next_day">Next Day</SelectItem>}
                  {availableServices.includes("two_day") && <SelectItem value="two_day">Two Day</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dpd-weight">Measured total weight (kg)</Label>
              <Input id="dpd-weight" type="number" inputMode="decimal" min="0.1" max={Number(job.packageCount) * 30} step="0.1" value={weight} onChange={event => setWeight(event.target.value)} placeholder="Weigh the packed shipment" />
              <p className="text-xs text-muted-foreground">Enter the actual combined packed weight. No weight is assumed; maximum 30kg per standard box.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dpd-dispatch">Actual dispatch date</Label>
              <Input id="dpd-dispatch" type="date" value={dispatchDate} onChange={event => setDispatchDate(event.target.value)} />
              <p className="text-xs text-muted-foreground">Enter the date this shipment actually dispatched. Existing shipments are not assumed to dispatch today.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dpd-carriage">Carriage allowance (£ / parcel)</Label>
              <Input id="dpd-carriage" type="number" min="0" max="100" step="0.01" value={carriage} onChange={event => setCarriage(event.target.value)} placeholder="Enter account allowance (or 0)" />
              <p className="text-xs text-amber-800 dark:text-amber-300">The 20 November invoice shows £6.60 across 30 parcels: £0.22 per parcel. Other invoices suggest exceptions. Enter the allowance you approve; this is not a verified universal rate. Enter 0 only if none applies.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dpd-extra">Other charges (£)</Label>
              <Input id="dpd-extra" type="number" min="0" max="5000" step="0.01" value={extraCharges} onChange={event => setExtraCharges(event.target.value)} />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Checkbox id="dpd-congestion" checked={congestion} onCheckedChange={value => setCongestion(value === true)} />
              <Label htmlFor="dpd-congestion">Add congestion charge (£0.95)</Label>
            </div>
          </div>

          <label className="flex items-start gap-3 rounded-md border p-3 text-sm">
            <Checkbox checked={tariffConfirmed} onCheckedChange={value => setTariffConfirmed(value === true)} />
            <span>I checked the destination tariff for this actual postcode and selected the applicable region.</span>
          </label>

          {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}

          {quote && quoteIsCurrent && (
            <section className="space-y-4 rounded-lg border bg-muted/30 p-4" aria-live="polite">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div><p className="text-sm text-muted-foreground">Estimated DPD cost</p><p className="text-2xl font-semibold">{money(quote.estimatedDpdCost)}</p></div>
                <div className="text-right"><p className="text-sm text-muted-foreground">Customer charge · before VAT</p><p className="text-xl font-semibold">{money(quote.customerCharge)}</p></div>
              </div>
              <p className="text-sm text-muted-foreground">{quote.regionLabel} · {quote.serviceLabel} · Billable weight {quote.billableWeightKg}kg</p>
              <div className="divide-y rounded-md border bg-background">
                {quote.breakdown.map((row, index) => <div key={`${row.label}-${index}`} className="flex justify-between gap-3 px-3 py-2 text-sm"><span>{row.label}</span><span className="tabular-nums">{money(row.amount)}</span></div>)}
                <div className="flex justify-between gap-3 px-3 py-2 text-sm font-medium"><span>{quote.markupPercent}% customer markup</span><span className="tabular-nums">{money(quote.markupAmount)}</span></div>
              </div>
              {quote.markupPercent > 0 && <p className="text-sm">The {quote.markupPercent}% markup applies because this shipment contains more than four boxes.</p>}
              {!shipmentReadyForApproval && <p className="text-sm text-destructive">Record the shipment tracking number and shipping method before approving the estimate.</p>}
              {comparisonQuotes.length > 0 && <p className="text-xs text-muted-foreground">Other service for this same destination tariff: {comparisonQuotes[0].label}, {money(comparisonQuotes[0].cost)} estimated DPD cost. {comparisonQuotes[0].cost < quote.estimatedDpdCost ? "This may be cheaper for a future booking." : "The service quoted above is no more expensive."} This estimate must retain the service actually used. No live DPD eligibility check.</p>}
              <div className="space-y-1">{quote.warnings.map((warning, index) => <p key={index} className="flex gap-2 text-xs text-amber-800"><AlertCircle className="h-3.5 w-3.5 shrink-0" />{warning}</p>)}</div>
              <label className="flex items-start gap-3 border-t pt-3 text-sm">
                <Checkbox checked={assumptionsConfirmed} onCheckedChange={value => setAssumptionsConfirmed(value === true)} />
                <span>I confirm the measured weight, destination tariff and estimate assumptions are accurate, and this quote is for the DPD shipment identity shown above.</span>
              </label>
            </section>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={isApproving || isCalculating}>Close</Button>
          <Button variant="secondary" onClick={calculate} disabled={isCalculating || isApproving || !postcode || !region || !service || !tariffConfirmed || !dispatchDate || !weight || !carriage}>
            {isCalculating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Calculating</> : <><Calculator className="mr-2 h-4 w-4" />Calculate estimate</>}
          </Button>
          {quote && quoteIsCurrent && <Button onClick={approve} disabled={!assumptionsConfirmed || !shipmentReadyForApproval || isApproving}><CheckCircle2 className="mr-2 h-4 w-4" />{isApproving ? "Saving…" : "Approve customer charge"}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
