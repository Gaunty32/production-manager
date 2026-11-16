type InvoiceReadinessJob = {
  id: string;
  jobName: string;
  jobNumber?: number | null;
  invoiceStatus: string;
  invoiceReference?: string | null;
};

/** Recheck the exact selection; never silently invoice a smaller set of orders. */
export function invoiceSelectionError(
  selectedIds: readonly string[],
  currentJobs: readonly InvoiceReadinessJob[],
): string | null {
  const byId = new Map(currentJobs.map(job => [job.id, job]));
  const problems: string[] = [];
  for (const id of selectedIds) {
    const job = byId.get(id);
    if (!job) {
      problems.push("A selected order is no longer available");
      continue;
    }
    if (job.invoiceStatus === "ready") continue;
    const label = `${job.jobName}${job.jobNumber ? ` (#${job.jobNumber})` : ""}`;
    problems.push(job.invoiceStatus === "invoiced"
      ? `${label} is already invoiced${job.invoiceReference ? ` on ${job.invoiceReference}` : ""}`
      : `${label} is no longer ready for invoicing`);
  }
  return problems.length
    ? `${problems.join("; ")}. No new invoice was created. Review the refreshed queue and select the remaining orders.`
    : null;
}
