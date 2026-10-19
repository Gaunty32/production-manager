export function getRequestedJobTypeLabel(value?: string | null): string {
  switch (value) {
    case "Embroidery":
      return "Embroidery";
    case "Print":
      return "Print";
    case "Mix":
      return "Print & Embroidery";
    default:
      return "Job type not specified";
  }
}
