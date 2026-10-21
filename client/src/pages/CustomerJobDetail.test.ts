import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import CustomerJobDetail from "./CustomerJobDetail";

const jobId = "message-regression";

function renderJob(options: { invalidDates?: boolean; missingSubmittedDate?: boolean } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, queryFn: async () => null } },
  });
  client.setQueryData(["/api/staff-auth/user"], null);
  client.setQueryData(["/api/customer-auth/user"], { email: "test@example.invalid", customerName: "Test customer" });
  client.setQueryData([`/api/customer-portal/jobs/${jobId}`], {
    id: jobId, jobName: "Attachment regression", quantity: 10, status: "production",
    submittedAt: options.missingSubmittedDate ? null : options.invalidDates ? "invalid" : "2026-10-20T09:00:00Z",
    requiredDispatchDate: options.invalidDates ? "invalid" : null,
    approvedAt: options.invalidDates ? "invalid" : null,
    rejectedAt: options.invalidDates ? "invalid" : null,
  });
  // This is the actual files API shape: createdAt, NOT uploadedAt.
  client.setQueryData([`/api/customer-portal/jobs/${jobId}/files`], [{
    id: "artwork", fileName: "artwork.pdf", fileSize: 123,
    createdAt: options.invalidDates ? "invalid" : "2026-10-20T09:00:00Z",
  }]);
  client.setQueryData([`/api/customer-portal/jobs/${jobId}/messages`], [{
    id: "attachment-message", senderType: "staff", message: null,
    imageUrl: "/test-image.png", createdAt: options.invalidDates ? "invalid" : "2026-10-20T09:00:00Z",
  }]);
  try {
    return renderToStaticMarkup(
      createElement(QueryClientProvider, { client },
        createElement(Router, { ssrPath: `/customer/job/${jobId}` },
          createElement(CustomerJobDetail))),
    );
  } finally {
    client.clear();
  }
}

test("View & Reply job page renders files using the API's createdAt field", () => {
  const html = renderJob();
  assert.match(html, /Attachment regression/);
  assert.match(html, /artwork\.pdf/);
  assert.match(html, /Uploaded Oct 20, 2026/);
  assert.match(html, /test-image\.png/);
});

test("invalid job, file and message dates cannot crash the conversation", () => {
  const html = renderJob({ invalidDates: true });
  assert.match(html, /Job Details &amp; Communication/);
  assert.match(html, /Uploaded Not available/);
  assert.doesNotMatch(html, /Invalid Date/);
});

test("jobs without a submission date do not show a fabricated 1970 date", () => {
  const html = renderJob({ missingSubmittedDate: true });
  assert.match(html, /Not available/);
  assert.doesNotMatch(html, /1970/);
});
