type ReferenceJob = { id: string; jobNumber?: number | null; jobName: string };

export function dpdJobReference(job: ReferenceJob): string {
  const number = job.jobNumber != null ? String(job.jobNumber) : job.id.slice(0, 8);
  return `#${number} ${job.jobName.replace(/\s+/g, " ").trim()}`.slice(0, 25);
}

// DPD exposes three 25-character sender-reference fields. Preserve readable
// names for the first two jobs; use the last field for further job numbers.
export function dpdJobReferences(jobs: ReferenceJob[]): string[] {
  if (jobs.length <= 3) return jobs.map(dpdJobReference);
  return [
    dpdJobReference(jobs[0]),
    dpdJobReference(jobs[1]),
    jobs.slice(2).map(job => `#${job.jobNumber ?? job.id.slice(0, 8)}`).join("+").slice(0, 25),
  ];
}
