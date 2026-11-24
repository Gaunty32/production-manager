import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AbodeStockings from "./AbodeStockings";

test("tracking-only controls replace label recovery, including existing-booking links without a shipment ID", () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalReact = Object.getOwnPropertyDescriptor(globalThis, "React");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  Object.defineProperty(globalThis, "React", { configurable: true, value: React });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { pathname: "/abode-stockings", search: "?existingDpdOrder=TEST-TRACKING&existingDpdTracking=6565279532" } },
  });
  try {
    client.setQueryData(["/api/abode"], {
      enabled: true, customer: { id: "fixture", name: "Abode", logoUrl: null },
      currentRate: 7, completedCount: 0, trackingConfigured: true,
      orders: [{
        id: "fixture", jobNumber: 1, orderNumber: "TEST-TRACKING", jobName: "Test stockings",
        completed: false, shipmentState: "review", shippingRoute: "dpd", labelAvailable: false,
        dhlTrackingNumber: null, dispatchedAt: null, deliveredAt: null, trackingStatus: null,
        recipient: { name: "Test", line1: "", town: "", postcode: "SW1A 1AA" },
        items: [], deliveryNotes: [],
      }],
    });
    const html = renderToStaticMarkup(<QueryClientProvider client={client}><AbodeStockings /></QueryClientProvider>);
    assert.match(html, />Save tracking<\/button>/);
    assert.match(html, /Save tracking and update order list/);
    assert.doesNotMatch(html, /Get existing label|Save existing label and update order list/);
  } finally {
    client.clear();
    for (const [key, descriptor] of [["window", originalWindow], ["React", originalReact]] as const) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
