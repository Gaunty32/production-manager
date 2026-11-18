import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AbodeStockings from "./AbodeStockings";

test("pre-booked orders stay in production and staff can despatch only after completion", () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  try {
    for (const customer of [false, true]) for (const completed of [false, true]) {
      Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { pathname: customer ? "/customer/stockings" : "/abode-stockings", search: "" } } });
      const client = new QueryClient({ defaultOptions: { queries: { queryFn: async () => null, retry: false, gcTime: 0 } } });
      try {
        client.setQueryData([customer ? "/api/customer-portal/abode" : "/api/abode"], {
          enabled: true, customer: { id: "fixture", name: "Abode", logoUrl: null },
          currentRate: 7, completedCount: 0, trackingConfigured: true,
          orders: [{
            id: "fixture", jobNumber: 1, orderNumber: "PREBOOKED", jobName: "Early label order",
            completed, shipmentState: "booked", shippingRoute: "dpd", labelAvailable: true,
            dhlTrackingNumber: "1234567890", bookedAt: "2026-11-18T07:00:00Z", dispatchedAt: null, deliveredAt: null,
            recipient: { name: "Test", line1: "", town: "", postcode: "SW1A 1AA" },
            items: [], deliveryNotes: [],
          }],
        });
        const html = renderToStaticMarkup(<QueryClientProvider client={client}><AbodeStockings /></QueryClientProvider>);
        assert.match(html, /Early label order/);
        assert.match(html, /No despatched orders yet/);
        if (customer) {
          assert.doesNotMatch(html, /Mark dispatched|Complete work/);
          assert.match(html, completed ? /Ready for despatch/ : /In Production/);
        } else {
          assert.match(html, /Label PDF/, "A label is printable before completion and confirmation");
          const button = html.match(/<button\b[^>]*>Mark dispatched<\/button>/)?.[0];
          assert.ok(button);
          if (completed) assert.doesNotMatch(button, /\sdisabled=/);
          else {
            assert.match(button, /\sdisabled=/);
            assert.match(html, /Complete work/);
          }
        }
      } finally { client.clear(); }
    }
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("completed DPD orders needing recovery have an enabled despatch button", () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { pathname: "/abode-stockings", search: "" } } });
  try {
    for (const shipmentState of ["review", "booking", "unbooked", "booked"]) {
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
      assert.match(html, /aria-label="Choose an order sheet and delivery-note PDFs"[^>]*multiple=""/);
      assert.match(html, /Drag and drop delivery-note PDFs here/);
      assert.match(html, /Drag and drop delivery note for order TEST-ORDER/);
      for (const section of ["awaiting-production", "despatched"]) {
        assert.match(html, new RegExp(`<button[^>]*aria-controls="heading-${section}"`), "Each summary total must be a keyboard-accessible button");
        assert.match(html, new RegExp(`<h3[^>]*id="heading-${section}"[^>]*tabindex="-1"`), "The matching section heading must accept focus");
      }
      const button = html.match(/<button\b[^>]*>Mark dispatched<\/button>/)?.[0];
      assert.ok(button, `Despatch action must exist for ${shipmentState}`);
      assert.doesNotMatch(button, /\sdisabled(?:=|[\s>])/, `Recovery must be reachable for ${shipmentState}`);
      assert.match(button, /no label or tracking required/);
      assert.match(html, /Save existing tracking/, "Staff can save tracking without recovering a label");
      client.clear();
    }
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("customer card and spreadsheet views expose all supplied DPD numbers without staff controls", () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { pathname: "/customer/stockings", search: "" } } });
  const client = new QueryClient({ defaultOptions: { queries: { queryFn: async () => null, retry: false, gcTime: 0 } } });
  try {
    const numbers = ["6895132451", "6895318162", "6895387834", "6895515169"];
    client.setQueryData(["/api/customer-portal/abode"], {
      enabled: true, customer: { id: "fixture", name: "Abode", logoUrl: null },
      currentRate: 7, completedCount: 4, trackingConfigured: false,
      orders: numbers.map((number, index) => ({
        id: `fixture-${index}`, jobNumber: index, orderNumber: `TEST-${index}`, jobName: "Test stockings",
        completed: true, shipmentState: "review", shippingRoute: "dpd", labelAvailable: false,
        dhlTrackingNumber: number, dispatchedAt: "2026-11-13T12:00:00Z", deliveredAt: null, trackingStatus: "Despatched",
        recipient: { name: "Test", line1: "", town: "", postcode: "SW1A 1AA" },
        items: [], deliveryNotes: [],
      })),
    });
    const html = renderToStaticMarkup(<QueryClientProvider client={client}><AbodeStockings /></QueryClientProvider>);
    assert.match(html, /aria-label="Choose an order sheet and delivery-note PDFs"[^>]*multiple=""/);
    assert.match(html, /Drag and drop delivery-note PDFs here/);
    for (const number of numbers) {
      assert.match(html, new RegExp(`href="https://track.dpdlocal.co.uk/search\\?reference=${number}&amp;postcode=SW1A\\+1AA"`));
      assert.match(html, new RegExp(`>${number}<`));
    }
    assert.doesNotMatch(html, /Save existing tracking|DPD tracking is not connected/);
  } finally {
    client.clear();
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
