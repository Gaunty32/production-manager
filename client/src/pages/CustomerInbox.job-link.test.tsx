import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import CustomerInbox from "./CustomerInbox";

function renderInbox(jobId: string, withConversation: boolean) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, queryFn: async () => null } },
  });
  client.setQueryData(["/api/auth/user"], null);
  client.setQueryData(["/api/customer-auth/user"], { id: "fixture-user", firstName: "Test" });
  client.setQueryData(["/api/customer-portal/conversations"], withConversation ? [{
    jobId, jobName: "Correct queue job", unreadCount: 0, completed: false, isArchived: false,
  }] : []);
  client.setQueryData(["/api/customer-portal/direct-conversations"], []);
  client.setQueryData([`/api/customer-portal/jobs/${jobId}`], { jobName: "New queue job", completed: false });
  client.setQueryData([`/api/customer-portal/jobs/${jobId}/messages`], [{
    id: "fixture-message", senderType: "staff", message: "Correct job conversation",
    createdAt: "2026-11-17T12:00:00Z",
  }]);
  try {
    return renderToStaticMarkup(
      <Router ssrPath={`/customer/messages?jobId=${encodeURIComponent(jobId)}`} searchHook={() => `jobId=${encodeURIComponent(jobId)}`}>
        <QueryClientProvider client={client}><CustomerInbox /></QueryClientProvider>
      </Router>,
    );
  } finally {
    client.clear();
  }
}

test("queue links open the selected job conversation immediately", () => {
  const html = renderInbox("queue-job", true);
  assert.match(html, /Correct queue job/);
  assert.match(html, /Correct job conversation/);
});

test("a job without an existing conversation still opens with its job name", () => {
  const html = renderInbox("new-queue-job", false);
  assert.match(html, /New queue job/);
  assert.match(html, /Correct job conversation/);
});
