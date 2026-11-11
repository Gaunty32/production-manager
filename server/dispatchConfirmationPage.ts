export interface DispatchConfirmationView {
  brandName: string;
  logoUrl: string | null;
  reference: string;
  dispatchRecordedAt: string | null;
  trackingUrl?: string | null;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}

function safeHttpsUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function formatRecordedDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return escapeHtml(
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "Europe/London",
    }).format(date),
  );
}

function document(content: string, title: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <meta name="referrer" content="no-referrer">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23176b55' d='M12 2 2 7v10l10 5 10-5V7zm0 3 6.6 3.3L12 11.6 5.4 8.3zM5 10.8l5.5 2.8v5L5 15.8zm8.5 7.8v-5l5.5-2.8v5z'/%3E%3C/svg%3E">
  <meta name="theme-color" content="#f3f5f1">
  <title>${title}</title>
  <style>
    :root {
      color-scheme: light;
      --paper: #f3f5f1;
      --surface: #fffefa;
      --ink: #202d2a;
      --muted: #687671;
      --line: #dce4de;
      --green: #176b55;
      --green-deep: #124b3f;
      --mint: #e7f1eb;
      --gold: #d6a94f;
      font-family: "Avenir Next", Avenir, "Segoe UI", sans-serif;
      font-synthesis: none;
      text-rendering: optimizeLegibility;
    }
    * { box-sizing: border-box; }
    body {
      min-height: 100vh;
      min-height: 100dvh;
      margin: 0;
      padding: 28px 18px;
      display: grid;
      place-items: center;
      color: var(--ink);
      background:
        radial-gradient(ellipse at 50% 0%, rgba(214, 169, 79, .12), transparent 37rem),
        var(--paper);
    }
    .page { width: min(100%, 620px); animation: arrive .55s ease-out both; }
    .brandbar {
      min-height: 48px;
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 12px;
      margin: 0 auto 22px;
    }
    .brand-mark {
      width: 34px;
      height: 34px;
      display: grid;
      place-items: center;
      flex: 0 0 auto;
      border-radius: 11px 11px 11px 3px;
      color: #fffefa;
      background: var(--green);
    }
    .brand-mark svg { display: block; }
    .brand-name {
      max-width: min(70vw, 400px);
      overflow-wrap: anywhere;
      color: var(--green-deep);
      font-size: 1.02rem;
      font-weight: 750;
      letter-spacing: -.025em;
    }
    .brand-logo {
      display: block;
      max-width: min(68vw, 190px);
      max-height: 48px;
      width: auto;
      height: auto;
      object-fit: contain;
    }
    .card {
      overflow: hidden;
      border: 1px solid rgba(39, 79, 64, .12);
      border-radius: 20px;
      background: var(--surface);
      box-shadow: 0 24px 70px rgba(35, 59, 47, .09), 0 3px 12px rgba(35, 59, 47, .04);
    }
    .card-top {
      position: relative;
      padding: 34px 28px 29px;
      color: #f8fbf8;
      background: var(--green-deep);
    }
    .card-top::after {
      content: "";
      position: absolute;
      width: 180px;
      height: 180px;
      right: -72px;
      top: -116px;
      border: 1px solid rgba(240, 220, 167, .24);
      border-radius: 50%;
      box-shadow: 0 0 0 19px rgba(240, 220, 167, .035), 0 0 0 40px rgba(240, 220, 167, .025);
      pointer-events: none;
    }
    .eyebrow {
      display: flex;
      align-items: center;
      gap: 9px;
      margin: 0 0 16px;
      color: #d5e4db;
      font-size: .71rem;
      font-weight: 700;
      letter-spacing: .13em;
      text-transform: uppercase;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #e0bd6b;
      box-shadow: 0 0 0 4px rgba(224, 189, 107, .15);
    }
    h1 {
      position: relative;
      z-index: 1;
      max-width: 460px;
      margin: 0;
      font-size: clamp(1.8rem, 7vw, 2.65rem);
      font-weight: 650;
      letter-spacing: -.045em;
      line-height: 1.08;
    }
    .card-body { padding: 28px; }
    .reference-label {
      margin: 0 0 7px;
      color: var(--muted);
      font-size: .74rem;
      font-weight: 700;
      letter-spacing: .11em;
      text-transform: uppercase;
    }
    .reference {
      margin: 0;
      overflow-wrap: anywhere;
      color: var(--green-deep);
      font-size: clamp(1.25rem, 5vw, 1.65rem);
      font-weight: 700;
      letter-spacing: -.025em;
    }
    .divider { height: 1px; margin: 23px 0; background: var(--line); }
    .carrier-row {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .carrier-icon {
      width: 46px;
      height: 46px;
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      border-radius: 14px;
      color: var(--green);
      background: var(--mint);
    }
    .carrier-copy { min-width: 0; }
    .carrier-copy strong {
      display: block;
      font-size: .98rem;
      font-weight: 700;
    }
    .carrier-copy span {
      display: block;
      margin-top: 4px;
      color: var(--muted);
      font-size: .87rem;
      line-height: 1.45;
    }
    .recorded {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 5px 14px;
      margin-top: 22px;
      padding: 15px 16px;
      border: 1px solid #e6e9df;
      border-radius: 12px;
      background: #f8f8f1;
    }
    .recorded-label { color: var(--muted); font-size: .82rem; }
    .tracking-button {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 48px;
      margin-top: 24px;
      padding: 14px 20px;
      border-radius: 10px;
      background: var(--green);
      color: #fff;
      font-weight: 700;
      text-decoration: none;
      text-align: center;
    }
    .tracking-button:hover { background: var(--green-deep); }
    .tracking-button:focus-visible { outline: 3px solid var(--gold); outline-offset: 4px; }
    .recorded time { color: var(--ink); font-size: .87rem; font-weight: 650; }
    .notice {
      margin: 20px 0 0;
      padding: 14px 16px;
      border-left: 3px solid var(--gold);
      border-radius: 0 9px 9px 0;
      color: #53625c;
      background: #faf7ed;
      font-size: .84rem;
      line-height: 1.6;
    }
    .footer {
      margin: 19px 8px 0;
      color: #75817b;
      font-size: .75rem;
      line-height: 1.55;
      text-align: center;
    }
    .unavailable {
      padding: 48px 30px 42px;
      text-align: center;
    }
    .unavailable-mark {
      width: 54px;
      height: 54px;
      display: grid;
      place-items: center;
      margin: 0 auto 21px;
      border: 1px solid #dfe7df;
      border-radius: 18px 18px 18px 6px;
      color: var(--green);
      background: var(--mint);
    }
    .unavailable h1 { margin: 0 auto 12px; color: var(--green-deep); }
    .unavailable p {
      max-width: 390px;
      margin: 0 auto;
      color: var(--muted);
      font-size: .95rem;
      line-height: 1.65;
    }
    @keyframes arrive {
      from { opacity: 0; transform: translateY(9px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; }
    }
    @media (min-width: 600px) {
      body { padding: 50px 28px; }
      .brandbar { margin-bottom: 25px; }
      .card-top { padding: 39px 40px 34px; }
      .card-body { padding: 34px 40px 38px; }
      .unavailable { padding: 62px 48px 56px; }
    }
    @media print {
      body { padding: 0; background: #fff; }
      .card { box-shadow: none; }
    }
  </style>
</head>
<body>
  ${content}
</body>
</html>`;
}

export function renderDispatchConfirmationPage(data: DispatchConfirmationView | null): string {
  if (!data) {
    return document(
      `<main class="page">
  <section class="card unavailable" aria-labelledby="page-title">
    <div class="unavailable-mark" aria-hidden="true">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
        <path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5v-7Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
        <path d="m4.4 8.7 7.6 4.4 7.6-4.4M12 13.2V20" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
      </svg>
    </div>
    <h1 id="page-title">Confirmation unavailable</h1>
    <p>This dispatch confirmation may have expired or may no longer be available.</p>
  </section>
</main>`,
      "Dispatch confirmation",
    );
  }

  const brandName = escapeHtml(data.brandName);
  const reference = escapeHtml(data.reference);
  const logoUrl = safeHttpsUrl(data.logoUrl);
  const date = formatRecordedDate(data.dispatchRecordedAt);
  const trackingUrl = safeHttpsUrl(data.trackingUrl || null);
  const hasDpdTracking = trackingUrl && new URL(trackingUrl).origin === "https://track.dpdlocal.co.uk"
    && new URL(trackingUrl).pathname === "/search";
  const tracking = hasDpdTracking
    ? `<a class="tracking-button" href="${escapeHtml(trackingUrl!)}" target="_blank" rel="noopener noreferrer">Track your parcel</a>
      <p class="notice">View the latest delivery updates on DPD Local. You may be asked for your delivery postcode.</p>`
    : `<p class="notice">This confirms dispatch only. There are no live delivery updates or delivery estimate on this page.</p>`;
  const brand = logoUrl
    ? `<img class="brand-logo" src="${escapeHtml(logoUrl)}" alt="${brandName}" referrerpolicy="no-referrer">`
    : `<span class="brand-mark" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M5 7.5 12 4l7 3.5v8L12 20l-7-4.5v-8Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
          <path d="m5.5 7.8 6.5 3.7 6.5-3.7M12 11.5V20" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
        </svg>
      </span><span class="brand-name">${brandName}</span>`;

  const recorded = date
    ? `<div class="recorded">
        <span class="recorded-label">Dispatch recorded</span>
        <time>${date}</time>
      </div>`
    : `<p class="notice">Dispatch date has not been recorded.</p>`;

  return document(
    `<main class="page">
  <header class="brandbar" aria-label="${brandName}">${brand}</header>
  <article class="card" aria-labelledby="page-title">
    <div class="card-top">
      <p class="eyebrow"><span class="status-dot" aria-hidden="true"></span>Dispatch confirmation</p>
      <h1 id="page-title">Your order has been dispatched</h1>
    </div>
    <div class="card-body">
      <p class="reference-label">Customer order reference</p>
      <p class="reference">${reference}</p>
      <div class="divider" role="presentation"></div>
      <div class="carrier-row">
        <div class="carrier-icon" aria-hidden="true">
          <svg width="25" height="25" viewBox="0 0 24 24" fill="none">
            <path d="M3 7h11v10H3zM14 10h4l3 3v4h-7z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
            <circle cx="7.5" cy="18" r="1.7" fill="currentColor"/>
            <circle cx="17.5" cy="18" r="1.7" fill="currentColor"/>
          </svg>
        </div>
        <div class="carrier-copy">
          <strong>Dispatch confirmed with DPD Local</strong>
          <span>Your order has been marked as dispatched.</span>
        </div>
      </div>
      ${recorded}
      ${tracking}
    </div>
  </article>
  <p class="footer">This page is a dispatch confirmation for the order reference shown above.</p>
</main>`,
    "Dispatch confirmation",
  );
}
