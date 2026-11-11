import { execFileSync } from "node:child_process";
import puppeteer from "puppeteer-core";

let rendering = false;

/** Render the original courier layout, including its barcodes; never recreate it. */
export async function renderAbodeLabelPdf(labelHtml: string): Promise<Buffer> {
  if (rendering) throw new Error("Another label PDF is being prepared. Please try again shortly.");
  rendering = true;
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(),
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
      headless: true,
      timeout: 30000,
    });
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on("request", request => {
      if (request.url().startsWith("data:")) void request.continue();
      else void request.abort();
    });
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
      @page{size:A4;margin:0}html,body{margin:0;padding:0}body>div:last-child{page-break-after:auto!important}
      </style></head><body>${labelHtml}</body></html>`, { waitUntil: "load", timeout: 20000 });
    await page.evaluate(async () => {
      await Promise.all(Array.from(document.images, image => image.decode().catch(() => undefined)));
    });
    return Buffer.from(await page.pdf({ format: "A4", printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } }));
  } finally {
    try { await browser?.close(); } finally { rendering = false; }
  }
}
