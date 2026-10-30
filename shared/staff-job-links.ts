export function staffJobPath(jobId: string): string {
  return `/staff/job/${encodeURIComponent(jobId)}`;
}

/** Preserve email job destinations after either staff sign-in method. */
export function staffJobSignInDestination(pathname: string, search = "", hash = ""): string {
  if (!/^\/(?:staff\/job|jobs)\/[^/]+\/?$/.test(pathname)) return "/";
  return `${pathname}${search}${hash}`;
}
