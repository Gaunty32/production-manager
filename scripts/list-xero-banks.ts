import { xeroService } from "../server/xero";

(async () => {
  try {
    const token = await (xeroService as any).getAccessToken();
    const tenantId = (xeroService as any).getTenantId();
    const apiUrl = (xeroService as any).apiUrl;

    const res = await fetch(`${apiUrl}/Accounts?where=${encodeURIComponent('Type=="BANK"')}`, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "xero-tenant-id": tenantId,
        "Accept": "application/json",
      },
    });
    if (!res.ok) {
      console.error("HTTP", res.status, await res.text());
      process.exit(1);
    }
    const data = await res.json();
    console.log("\nBank accounts in Xero:\n");
    for (const a of data.Accounts || []) {
      console.log(`  Code: ${(a.Code || "(none)").padEnd(8)} Name: ${a.Name}   Status: ${a.Status}   BankAccountNumber: ${a.BankAccountNumber || "-"}`);
    }
  } catch (e: any) {
    console.error("Error:", e?.message || e);
    process.exit(1);
  }
})();
