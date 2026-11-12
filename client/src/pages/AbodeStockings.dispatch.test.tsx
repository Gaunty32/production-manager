import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AbodeStockings from "./AbodeStockings";

test("completed DPD orders needing recovery have an enabled despatch button", () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { pathname: "/abode-stockings", search: "" } } });
  try {
    for (const shipmentState of ["review", "booking"]) {
      const client = new QueryClient({ defaultOptions: { queries: { queryFn: async () => null, retry: false, gcTime: 0 } } });
      client.setQueryData(["/api/abode"], {
        enabled: true, customer: { id: "fixture", name: "Abode", logoUrl: null },
        currentRate: 7, completedCount: 3, trackingConfigured: true,
        orders: [{
          id: "fixture", jobNumber: 1, orderNumber: "TEST-ORDER", jobName: "Test stockings",
          completed: true, shipmentState, shippingRoute: "dpd", labelAvailable: false,
          dhlTrackingNumber: null, dispatchedAt: null, deliveredAt: null, trackingStatus: null,
          recipient: { name: "Test", line1: "", town: "", postcode: "SW1A 1AA" },
          items: [], deliveryNotes: [],
        }],
      });
      const html = renderToStaticMarkup(<QueryClientProvider client={client}><AbodeStockings /></QueryClientProvider>);
      for (const section of ["awaiting-production", "despatched"]) {
        assert.match(html, new RegExp(`<button[^>]*aria-controls="heading-${section}"`), "Each summary total must be a keyboard-accessible button");
        assert.match(html, new RegExp(`<h3[^>]*id="heading-${section}"[^>]*tabindex="-1"`), "The matching section heading must accept focus");
      }
      const button = html.match(/<button\b[^>]*>Mark dispatched<\/button>/)?.[0];
      assert.ok(button, `Despatch action must exist for ${shipmentState}`);
      assert.doesNotMatch(button, /\sdisabled(?:=|[\s>])/, `Recovery must be reachable for ${shipmentState}`);
      assert.match(button, /Save the existing label and tracking/);
      client.clear();
    }
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
