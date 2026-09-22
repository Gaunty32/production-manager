# DPD Integration Audit for Select Intelligence

## 1. Executive conclusion

Production Management already owns DPD Local authentication, shipment booking, label retrieval, job/customer linkage, and storage of the returned consignment number. It does **not** currently implement a DPD tracking-read API, tracking-event polling, webhooks, or tracking-event persistence.

The integration therefore cannot yet supply the live status, delivery attempts, exceptions, proof of delivery, or event history required by the proposed Select Intelligence Delivery Monitor.

The recommended architecture is still **Option A**: Production Management should remain the only holder of DPD credentials and expose a narrowly scoped, authenticated, read-only service to Select Intelligence. Before that service is useful as a live Delivery Monitor, Production Management must add an approved DPD tracking-read integration and decide how live responses will be cached or persisted.

No DPD write operation was called during this audit. No credential values were read or exposed.

## 2. Existing integration evidence

### DPD client

- `server/dpd.ts:1-3` identifies the integration as DPD Local API v3.2.
- `server/dpd.ts:43` uses `https://api.dpdlocal.co.uk`.
- `server/dpd.ts:49-68` reads configuration and determines whether the integration is configured.
- `server/dpd.ts:70-112` authenticates and supplies the DPD session header.
- `server/dpd.ts:127-255` creates shipments and parses the booking response.
- `server/dpd.ts:258-275` retrieves the shipment label.

### Authentication

The client logs in with HTTP Basic authentication at `/user/?action=login`, including a `GeoClient` account header. DPD returns a `GeoSession`, which is used for subsequent requests.

Required secret/environment-variable names:

- `DPD_API_USERNAME`
- `DPD_API_PASSWORD`
- `DPD_ACCOUNT_NUMBER`

Optional sender/network configuration names:

- `DPD_SENDER_NAME`
- `DPD_SENDER_LINE1`
- `DPD_SENDER_TOWN`
- `DPD_SENDER_POSTCODE`
- `DPD_NETWORK_CODE`

The three required names are present in the current development environment. The optional names are absent, so the code defaults are used. This audit did not inspect their values.

The source does not identify whether the configured account is formally classified by DPD as production or test. The API hostname is the live DPD Local hostname, but that alone does not prove the account classification.

### Routes and UI workflow

- `server/routes.ts:12203-12214` provides staff-authenticated status and connection-test routes.
- `server/routes.ts:12215-12295` provides the staff-authenticated booking route.
- `client/src/components/DpdBookingDialog.tsx:174-211` submits a DPD booking and refreshes job data.
- `client/src/components/DpdBookingDialog.tsx:456-486` explains and executes consolidated booking from the staff UI.

The booking route accepts one or more Production Management job IDs. After DPD returns successfully, it stores the returned tracking/consignment number against every selected job.

### Existing internal and customer-facing data

- `shared/schema.ts:131-158` defines job shipment fields.
- `server/routes.ts:12276-12295` stores the returned number and returns booking details to the UI.
- `client/src/pages/CustomerDashboard.tsx:199-200` derives a DPD Local public tracking URL.
- `client/src/pages/CustomerDashboard.tsx:1162-1186`, `1363-1371`, and `1440-1448` display persisted tracking references.
- `server/customerOrderNotifications.ts:79-162` sends and retries dispatch notifications but does not query DPD tracking.
- `server/emailService.ts:1334-1342` includes the tracking reference/link in dispatch email content.

There is no existing route that exposes a carrier-neutral shipment feed or live DPD tracking data.

### Workflows and schedules

There is no DPD tracking poller or DPD webhook workflow.

The dispatch-notification retry worker runs every five minutes, but it only retries queued customer emails. It does not call DPD or refresh shipment status.

## 3. DPD capabilities confirmed

The following capabilities are confirmed from the existing booking response and implementation:

| Capability | Confirmed? | Source/provenance |
|---|---:|---|
| Consignment number | Yes | Returned by DPD booking and persisted as `jobs.dhl_tracking_number` |
| Parcel numbers | Yes, at booking time | Returned by DPD as `parcelNumbers[]`, but not persisted |
| Parcel count | Partly | Sent to DPD and stored locally as `package_count`; not re-confirmed through tracking |
| Carrier | Derived | Known from the integration as DPD Local, not stored per shipment |
| Service/network | Partly | Network code is sent to DPD; local `shipping_method` is not proven to be DPD's canonical service name |
| Booking collection timestamp/date | Partly | A same-day 09:00 collection value is generated for the booking request; it is not persisted or confirmed as an actual collection scan |
| Tracking URL | Yes, derived | Constructed from the returned reference and DPD Local public tracking URL |
| Label retrieval | Yes | HTML label fetched by DPD shipment/job ID |
| Multi-parcel booking | Yes | One booking can contain `numberOfParcels > 1` |

Fields genuinely returned by DPD in the implemented booking path:

- DPD shipment/job ID.
- Consignment number.
- Parcel number array.
- Booking response data needed to retrieve the label.

Fields calculated or supplied by Production Management:

- Parcel count.
- Aggregate shipment weight.
- Booking collection date/time.
- Customer/job reference.
- Tracking URL.
- Production Management consolidated-shipment grouping.
- Customer name and order/job linkage.

## 4. Missing capabilities

The following required Delivery Monitor capabilities are not implemented or evidenced:

- Expected delivery date.
- Current carrier status.
- Complete tracking-event history.
- Event codes and descriptions.
- First delivery-attempt timestamp.
- Delivered timestamp.
- Exception/problem status.
- Exception reason.
- Recipient-action delay.
- Proof-of-delivery availability.
- Actual collection/despatch scan timestamp.
- A tracking-data `source_updated_at` timestamp.

The current account's permission to call a DPD tracking-read endpoint is also unconfirmed. The connection test only proves that authentication succeeds.

No public DPD tracking page was scraped during this audit.

## 5. Existing data coverage and counts

### Schema coverage

The `jobs` table contains:

- Stable UUID `id`.
- Unique integer `job_number`.
- `customer_id`, linked to `customers.id`.
- `shipping_method`.
- Legacy-named `dhl_tracking_number`, currently also used for DPD consignment numbers.
- `package_count`.
- `package_type`.
- `shipping_cost`.
- `consolidated_shipment_id`.
- `submitted_at`.
- `required_dispatch_date`.
- Internal dispatch-email queue/sent timestamps.

Relevant evidence:

- `shared/schema.ts:97-117` — customers.
- `shared/schema.ts:131-189` — jobs and shipment-related fields.
- `shared/schema.ts:620-647` — shipment-field validation.

There is no:

- Consignment table.
- Parcel table.
- Tracking-event table.
- Carrier-status history.
- DPD webhook table.
- Proof-of-delivery record.

### Development data

A read-only aggregate query against the current development database returned:

- Total jobs: **16**
- Jobs with a non-empty stored tracking number: **0**
- Distinct stored consignment numbers: **0**
- Tracked jobs with package count: **0**
- Tracked jobs with shipping method: **0**
- Tracked jobs in an application consolidation group: **0**
- Earliest tracked submission date: **not available**
- Latest tracked submission date: **not available**

There is therefore no development tracking record from which to produce a real DPD tracking-response example.

### Production data limitation

The app uses an external PostgreSQL connection (`server/db.ts:1-15`). The safe Replit production read replica is not the source of truth for that external database, and this audit was not provided a separate read-only production connection. Production counts, earliest shipment date, and historical coverage remain unresolved.

Jobs can be hard-deleted (`server/storage.ts:692-694`), so the code does not guarantee permanent consignment retention. Completed jobs appear to remain unless manually deleted, but there is no explicit retention policy.

## 6. Multi-parcel behavior

### Booking representation

`server/dpd.ts:127-212` sends one shipment request containing:

- `numberOfParcels`.
- Aggregate shipment weight.
- One set of delivery details.
- One customer reference.

DPD returns one consignment detail containing:

- One consignment number.
- An array of parcel numbers.

`consolidate: false` is sent to DPD. Production Management's own consolidation is separate from DPD's consolidation semantics.

### Local persistence

Only the returned consignment/tracking number is persisted. Parcel numbers and the DPD shipment/job ID are returned to the booking UI but are not stored.

When several Production Management jobs are booked together, the same consignment number is copied to each selected job (`server/routes.ts:12276-12288`). Application-level grouping uses `consolidated_shipment_id` (`server/routes.ts:7157-7206`, `10631-10655`).

### Stable identity

For future carrier tracking, the stable external shipment identity should be the DPD **consignment number**. Production Management's `consolidated_shipment_id` is useful for internal grouping but must not be represented as a DPD parent consignment.

The current implementation does not establish:

- Whether each returned parcel number can be queried independently.
- Whether DPD's tracking response has an explicit parent consignment identifier.
- How split or partially delivered consignments appear.
- Whether DPD declares the consignment delivered only after every parcel is delivered.

Until the tracking response is confirmed, Delivery Monitor must not infer consignment completion from one parcel event. The safe future rule is to mark a multi-parcel consignment delivered only when DPD's consignment-level status says delivered or every known parcel has a terminal delivered status.

## 7. Authentication and rate-limit findings

### Session handling

- A successful login produces a `GeoSession`.
- The session is cached in server memory for 12 hours (`server/dpd.ts:43-47`, `70-101`).
- A connection test clears the cached session and authenticates again (`server/dpd.ts:114-124`).
- There is no automatic retry that clears and renews the session after a DPD 401/expired-session response.
- Autoscale instances do not share the in-memory session, so each active instance may authenticate separately.

### Rate limits and throttling

No DPD rate-limit constants, response-header handling, 429 retry, exponential backoff, request queue, or shared throttle were found.

DPD's actual account rate limit is not documented in this codebase and remains to be confirmed with DPD.

### Webhooks

No DPD webhook subscription, receiver, signature verification, or event ingestion exists.

### Restrictions

The code contains no evidence of IP allowlisting. Account/environment restrictions cannot be determined without DPD account documentation. No credential value was inspected.

## 8. Recommended cross-app architecture

### Recommendation: Option A, after extension

Production Management should own:

- DPD credentials and sessions.
- DPD tracking calls.
- Shipment-to-job/customer linkage.
- Rate limiting and retry behavior.
- Normalisation into a carrier-neutral schema.
- Removal of personal information from carrier event descriptions.

Select Intelligence should call an authenticated, read-only Production Management endpoint. DPD credentials should not be copied into Select Intelligence.

Production Management is published as a public Autoscale service with a successful build. Its primary production URL is `https://production.selectbranding.co.uk`. A public deployment makes server-to-server access possible, but the new route must require independent service authentication and must not rely on staff browser sessions.

### Authentication recommendation

Use a dedicated server-to-server bearer secret:

- Store a separate secret in each app.
- Compare its cryptographic hash or use constant-time token comparison.
- Scope it only to the Delivery Monitor read route.
- Never accept it in query parameters.
- Rotate it independently from DPD credentials.
- Log request metadata, not the token.

For stronger lifecycle management, a signed short-lived JWT with fixed issuer, audience, and scope is also suitable. A single rotated bearer secret is the smallest viable design for these two controlled apps.

### Live versus persisted data

Do not call DPD once per dashboard row on every Select Intelligence refresh.

Preferred model:

1. Persist each DPD consignment and parcel identity at booking time.
2. Refresh open consignments through a throttled background process.
3. Persist normalised current status and tracking events.
4. Poll frequently only for recent, non-terminal shipments.
5. Reduce polling after delivery and retain the final event history.
6. Serve Select Intelligence from persisted data with explicit freshness timestamps.

This avoids duplicate DPD calls across users and Autoscale instances, supports idempotent daily monitoring, and provides a stable audit trail.

If persistence is deferred, the endpoint may initially perform bounded live lookups, but it must enforce date windows, page-size limits, caching, concurrency limits, and a shared rate limiter.

## 9. Proposed read-only endpoint contract

This is a proposal only. It is not implemented.

### Request

`GET /api/integrations/select-intelligence/deliveries`

Supported query parameters:

- `collection_from=YYYY-MM-DD` — required for list requests.
- `collection_to=YYYY-MM-DD` — required; maximum range to be agreed, recommended 31 days.
- `consignment_number=...` — exact lookup; may be used without a date range.
- `cursor=...` — opaque pagination cursor.
- `limit=...` — default 100, maximum 250.

Stable ordering:

1. `collection_date` ascending.
2. `consignment_number` ascending.

The cursor should encode both ordering fields so pagination remains deterministic.

### Success response

```json
{
  "data": [
    {
      "shipment_id": "dpd-consignment:<consignment_number>",
      "order_id": "production-job-or-group-id",
      "customer_name": "Customer name",
      "carrier": "DPD Local",
      "service": null,
      "consignment_number": "consignment number",
      "parcel_count": 1,
      "collection_date": null,
      "expected_delivery_date": null,
      "first_delivery_attempt": null,
      "delivered_at": null,
      "current_status": null,
      "status_code": null,
      "exception_reason": null,
      "recipient_action_delay": null,
      "tracking_url": "https://track.dpdlocal.co.uk/search?reference=...",
      "last_tracking_event_at": null,
      "tracking_events": [],
      "source_updated_at": null
    }
  ],
  "next_cursor": null,
  "source_freshness": {
    "mode": "persisted",
    "generated_at": "ISO-8601 timestamp",
    "maximum_age_seconds": 900
  }
}
```

Fields not currently available must remain `null` or empty until confirmed from a real DPD tracking response. They must not be inferred from internal dispatch-email timestamps or required-dispatch dates.

### Tracking event model

After the DPD tracking contract is confirmed:

```json
{
  "event_id": "stable carrier event identity or deterministic hash",
  "parcel_number": "parcel number or null",
  "occurred_at": "ISO-8601 timestamp",
  "status_code": "carrier event code",
  "description": "sanitised event description",
  "location": null
}
```

Descriptions must be checked for recipient names, addresses, safe-place instructions, driver notes, or other personal information. Personal information should be removed before Select Intelligence receives it.

### Freshness and idempotency

- `source_updated_at` means the time Production Management last successfully refreshed that consignment from DPD.
- `last_tracking_event_at` means the latest carrier event timestamp.
- Repeating the same request without a source update must return the same shipment/event identifiers.
- Event arrays should be ordered by `occurred_at`, then stable `event_id`.
- Terminal delivered consignments should not change except for a later carrier correction.

### Error responses

- `400` — invalid date range, cursor, limit, or consignment format.
- `401` — missing or invalid service credential.
- `403` — valid credential without the required scope.
- `404` — exact consignment lookup not found.
- `429` — caller rate limit exceeded; include `Retry-After`.
- `502` — DPD failed during a permitted live lookup.
- `503` — tracking source temporarily unavailable or stale beyond policy.
- `500` — unexpected internal error with a non-sensitive correlation ID.

### Endpoint rate limit

Suggested initial Select Intelligence limit:

- 30 requests per minute.
- Maximum 250 consignments per response.
- Date range maximum 31 days.
- Exact-consignment lookups cached for a short TTL.

The internal DPD refresh rate must be set only after DPD confirms the account limit.

## 10. Anonymised example response

No real tracking response shape is available from the current integration. The example below uses only fields that Production Management can currently persist or derive. Unsupported live-tracking fields remain null or empty.

```json
{
  "data": [
    {
      "shipment_id": "dpd-consignment:ANON-CONSIGNMENT-001",
      "order_id": "ANON-ORDER-001",
      "customer_name": "Example Customer Ltd",
      "carrier": "DPD Local",
      "service": null,
      "consignment_number": "ANON-CONSIGNMENT-001",
      "parcel_count": 2,
      "collection_date": null,
      "expected_delivery_date": null,
      "first_delivery_attempt": null,
      "delivered_at": null,
      "current_status": null,
      "status_code": null,
      "exception_reason": null,
      "recipient_action_delay": null,
      "tracking_url": "https://track.dpdlocal.co.uk/search?reference=ANON-CONSIGNMENT-001",
      "last_tracking_event_at": null,
      "tracking_events": [],
      "source_updated_at": null
    }
  ],
  "next_cursor": null,
  "source_freshness": {
    "mode": "persisted-identifiers-only",
    "generated_at": "2026-09-22T08:00:00Z",
    "maximum_age_seconds": null
  }
}
```

## 11. Exact blockers or decisions still needed

1. Obtain DPD's approved tracking-read endpoint documentation for this account/API family.
2. Confirm that the current credentials permit tracking reads.
3. Capture and anonymise a real tracking response for:
   - One single-parcel consignment.
   - One multi-parcel consignment.
   - One partially delivered or exception consignment.
4. Confirm DPD event codes, terminal statuses, ETA fields, exception fields, proof-of-delivery fields, and retention window.
5. Confirm DPD rate limits and whether webhooks are supported for this account.
6. Decide whether to persist carrier events or use bounded live lookups. Persistence is recommended.
7. Persist DPD shipment/job ID and parcel numbers at booking time.
8. Separate the legacy `dhl_tracking_number` field into a carrier-neutral consignment model.
9. Define an explicit retention policy for completed consignments and events.
10. Provide safe read-only production database access to establish real counts and date coverage.
11. Choose the Select Intelligence service-authentication mechanism and rotation process.
12. Decide whether one Production Management consolidation group may contain multiple carrier consignments in future.

## 12. Relevant source-file references

- `server/dpd.ts:1-8` — API identity and environment names.
- `server/dpd.ts:43-124` — API host, session cache, authentication, connection test.
- `server/dpd.ts:127-255` — shipment booking and response parsing.
- `server/dpd.ts:258-275` — label retrieval.
- `server/routes.ts:7157-7206` — application consolidation grouping.
- `server/routes.ts:10631-10655` — grouping and tracking-number selection.
- `server/routes.ts:12203-12214` — DPD status/test routes.
- `server/routes.ts:12215-12295` — DPD booking route and tracking-number persistence.
- `server/customerOrderNotifications.ts:79-162` — dispatch notification queue/retry behavior.
- `server/emailService.ts:1334-1342` — dispatch tracking content.
- `server/db.ts:1-15` — external PostgreSQL connection.
- `server/storage.ts:692-694` — hard deletion of jobs.
- `shared/schema.ts:97-117` — customers.
- `shared/schema.ts:131-189` — jobs and shipment fields.
- `shared/schema.ts:620-647` — shipment-field validation.
- `client/src/components/DpdBookingDialog.tsx:174-211` — booking request.
- `client/src/components/DpdBookingDialog.tsx:456-486` — consolidated booking UI.
- `client/src/pages/CustomerDashboard.tsx:199-200` — public tracking URL.
- `client/src/pages/CustomerDashboard.tsx:1162-1186`, `1363-1371`, `1440-1448` — customer tracking display.

DPD INTEGRATION REQUIRES EXTENSION