import type { CustomerJobSubmission } from "./schema";

type JobType = CustomerJobSubmission["requestedJobType"];
type LogoType = CustomerJobSubmission["logoType"];

const repeatLogo = {
  value: "repeat_logo",
  label: "Repeat Logo",
  description: "We already have this logo set up and ready to go",
  testId: "button-logo-type-repeat",
} as const;

export function getCustomerLogoOptions(jobType: JobType) {
  if (jobType === "Print") {
    return [
      repeatLogo,
      {
        value: "new_logo_files_supplied",
        label: "Print Ready Files Supplied",
        description: "You are supplying the print ready files set to the correct colour and size.",
        testId: "button-logo-type-files-supplied",
      },
    ] as const;
  }
  return [
    repeatLogo,
    {
      value: "new_logo",
      label: "Digitising Required",
      description: "New logo setup — £12 charge, allow 48 hours for a sample",
      testId: "button-logo-type-new",
    },
    {
      value: "new_logo_files_supplied",
      label: "New Logo — Embroidery files & Madeira thread colours supplied",
      description: "You are providing your own embroidery files and thread colour references",
      testId: "button-logo-type-files-supplied",
    },
  ] as const;
}

// Keep an existing new-logo selection valid when changing to a print-only job.
// Also protects older portal clients from triggering embroidery setup emails.
export function normalizeCustomerLogoType(jobType: JobType, logoType: LogoType): LogoType {
  return jobType === "Print" && logoType === "new_logo" ? "new_logo_files_supplied" : logoType;
}
