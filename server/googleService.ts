// Google Drive + Sheets integration via Replit Connectors SDK
// Used for invoice verification against the Contract Embroidery Google Drive backup

import { ReplitConnectors } from "@replit/connectors-sdk";

const connectors = new ReplitConnectors();

const PARENT_FOLDER_ID = "13oC0VXOyvtX88BpSUDf7alZHE6LSw_SH";
const CALCULATIONS_SHEET_NAME = "Calculations";

// ── Rate limiting + retry ────────────────────────────────────────────────────
// Google Sheets caps read requests at 10/sec per user. When several customer
// panels load at once, uncontrolled parallel calls blow through that cap.
// All Google API calls go through googleApiJson(): a queue that spaces
// requests ~150ms apart and retries automatically on rate-limit errors.
const REQUEST_GAP_MS = 150;
let requestChain: Promise<void> = Promise.resolve();

function throttle(): Promise<void> {
  const next = requestChain.then(() => new Promise<void>(r => setTimeout(r, REQUEST_GAP_MS)));
  requestChain = next.catch(() => {});
  return next;
}

const isRateLimitError = (status: number, err: any): boolean =>
  status === 429 || err?.code === 429 || /rate limit/i.test(String(err?.message || ""));

async function googleApiJson(connector: string, path: string, init: { method: string; headers?: Record<string, string>; body?: string }): Promise<any> {
  const MAX_ATTEMPTS = 4;
  for (let attempt = 1; ; attempt++) {
    await throttle();
    const response = await connectors.proxy(connector, path, init);
    const data = await response.json().catch(() => ({}));
    const rateLimited = isRateLimitError(response.status, data?.error);
    if (rateLimited && attempt < MAX_ATTEMPTS) {
      const retryAfter = parseInt(response.headers?.get?.("Retry-After") || "0", 10);
      const waitMs = Math.max(retryAfter * 1000, attempt * 1500);
      console.warn(`[Google] Rate limited (attempt ${attempt}/${MAX_ATTEMPTS}), retrying in ${waitMs}ms: ${path.slice(0, 80)}`);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }
    return data;
  }
}

// The parent folder listing is identical for every customer — cache it briefly
// so a page of customer panels costs one Drive listing call, not one each.
let folderCache: { at: number; folders: { id: string; name: string }[] } | null = null;
const FOLDER_CACHE_TTL_MS = 5 * 60 * 1000;

export interface DriveSheetRow {
  rowIndex: number;   // 0-based index in the sheet (used for hiding)
  id: string;
  name: string;
  stitches: string;
  quantity: string;
  dateCompleted: string;
  carriageCost: string;
  embCost: string;
  total: string;
  setUp: string;
  processTime: string;
  notes: string;
}

export interface CustomerDriveData {
  rows: DriveSheetRow[];
  spreadsheetId: string;
  folderName: string;
  sheetNumericId: number;
}

// Normalise a name for fuzzy folder matching
function normaliseName(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Find the customer's subfolder inside the Contract Embroidery parent folder
async function findCustomerFolderId(customerName: string): Promise<{ folderId: string; folderName: string } | null> {
  let folders: { id: string; name: string }[];
  if (folderCache && Date.now() - folderCache.at < FOLDER_CACHE_TTL_MS) {
    folders = folderCache.folders;
  } else {
    const data = await googleApiJson(
      "google-drive",
      `/drive/v3/files?q='${PARENT_FOLDER_ID}'+in+parents+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false&fields=files(id,name)&pageSize=200`,
      { method: "GET" }
    );
    if (data.error) throw new Error(`Drive API error: ${data.error.message}`);
    folders = data.files || [];
    folderCache = { at: Date.now(), folders };
  }
  const needle = normaliseName(customerName);

  // 1. Exact normalised match
  let match = folders.find(f => normaliseName(f.name) === needle);

  // 2. One contains the other (handles truncated names like "Affinity Promotions &...")
  if (!match) {
    match = folders.find(f => {
      const fn = normaliseName(f.name);
      return fn.startsWith(needle.slice(0, 8)) || needle.startsWith(fn.slice(0, 8));
    });
  }

  return match ? { folderId: match.id, folderName: match.name } : null;
}

// Find the (first) Google Sheets file inside a customer folder
async function findSpreadsheetInFolder(folderId: string): Promise<{ spreadsheetId: string; name: string } | null> {
  const data = await googleApiJson(
    "google-drive",
    `/drive/v3/files?q='${folderId}'+in+parents+and+mimeType='application/vnd.google-apps.spreadsheet'+and+trashed=false&fields=files(id,name)`,
    { method: "GET" }
  );
  if (data.error) throw new Error(`Drive API error: ${data.error.message}`);

  const files: { id: string; name: string }[] = data.files || [];
  return files.length > 0 ? { spreadsheetId: files[0].id, name: files[0].name } : null;
}

// Fetch all visible (non-hidden) rows from the Calculations sheet for a customer
export async function getCustomerDriveRows(customerName: string): Promise<CustomerDriveData | null> {
  const folder = await findCustomerFolderId(customerName);
  if (!folder) return null;

  const sheet = await findSpreadsheetInFolder(folder.folderId);
  if (!sheet) return null;

  // Fetch values then row-visibility metadata (throttled + retried)
  const valData = await googleApiJson("google-sheet", `/v4/spreadsheets/${sheet.spreadsheetId}/values/${CALCULATIONS_SHEET_NAME}!A:K`, { method: "GET" });
  const metaData = await googleApiJson("google-sheet", `/v4/spreadsheets/${sheet.spreadsheetId}?includeGridData=true&fields=sheets(data(rowMetadata(hiddenByUser)),properties(title,sheetId))`, { method: "GET" });

  if (valData.error) throw new Error(`Sheets values error: ${valData.error.message}`);
  if (metaData.error) throw new Error(`Sheets metadata error: ${metaData.error.message}`);

  const values: string[][] = valData.values || [];

  // Find the Calculations sheet to get its numeric sheetId and row metadata
  const calcSheetMeta = (metaData.sheets || []).find((s: any) => s.properties?.title === CALCULATIONS_SHEET_NAME);
  const rowMetadata: { hiddenByUser?: boolean }[] = calcSheetMeta?.data?.[0]?.rowMetadata || [];
  const sheetNumericId: number = calcSheetMeta?.properties?.sheetId ?? 0;

  const rows: DriveSheetRow[] = [];

  // Row 0 = header, skip it; skip empty/hidden rows
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (!row || row.length === 0) continue;

    const isHidden = rowMetadata[i]?.hiddenByUser === true;
    if (isHidden) continue;

    const name = (row[1] || "").trim();
    if (!name) continue;

    rows.push({
      rowIndex: i,          // 0-based, used directly in batchUpdate
      id: row[0] || "",
      name,
      stitches: row[2] || "",
      quantity: row[3] || "",
      dateCompleted: row[4] || "",
      carriageCost: row[5] || "",
      embCost: row[6] || "",
      total: row[7] || "",
      setUp: row[8] || "",
      processTime: row[9] || "",
      notes: row[10] || "",
    });
  }

  return { rows, spreadsheetId: sheet.spreadsheetId, folderName: folder.folderName, sheetNumericId };
}

// Append a single row to a customer's Calculations sheet. Used when a job
// completes so the system-side job name lands on the Drive sheet verbatim
// (avoids fuzzy-name reconciliation mismatches). Returns false if the
// customer folder or spreadsheet can't be found — caller should treat that
// as a silent skip (not all customers have a Drive folder).
export async function appendJobRowToCustomerSheet(
  customerName: string,
  row: { jobName: string; quantity?: number | string; stitches?: number | string; dateCompleted?: string; notes?: string }
): Promise<boolean> {
  const folder = await findCustomerFolderId(customerName);
  if (!folder) return false;
  const sheet = await findSpreadsheetInFolder(folder.folderId);
  if (!sheet) return false;

  // Columns A..K — leave id (A) blank so the sheet owner can fill it, and only
  // populate the fields we know. The verification logic only matches on name.
  const values = [[
    "",                                      // A: id
    row.jobName,                             // B: name
    row.stitches != null ? String(row.stitches) : "", // C: stitches
    row.quantity != null ? String(row.quantity) : "", // D: quantity
    row.dateCompleted || "",                 // E: dateCompleted
    "",                                      // F: carriageCost
    "",                                      // G: embCost
    "",                                      // H: total
    "",                                      // I: setUp
    "",                                      // J: processTime
    row.notes || "",                         // K: notes
  ]];

  const data = await googleApiJson(
    "google-sheet",
    `/v4/spreadsheets/${sheet.spreadsheetId}/values/${CALCULATIONS_SHEET_NAME}!A:K:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      body: JSON.stringify({ values }),
      headers: { "Content-Type": "application/json" },
    }
  );
  if (data.error) throw new Error(`Sheets append error: ${data.error.message}`);
  return true;
}

// Hide specific rows in the Calculations sheet (rowIndices are 0-based)
export async function hideDriveRows(spreadsheetId: string, sheetNumericId: number, rowIndices: number[]): Promise<void> {
  if (rowIndices.length === 0) return;

  const requests = rowIndices.map(idx => ({
    updateDimensionProperties: {
      range: {
        sheetId: sheetNumericId,
        dimension: "ROWS",
        startIndex: idx,
        endIndex: idx + 1,
      },
      properties: { hiddenByUser: true },
      fields: "hiddenByUser",
    },
  }));

  const data = await googleApiJson(
    "google-sheet",
    `/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      body: JSON.stringify({ requests }),
      headers: { "Content-Type": "application/json" },
    }
  );
  if (data.error) throw new Error(`Sheets batchUpdate error: ${data.error.message}`);
}
