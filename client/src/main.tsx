import { createRoot } from "react-dom/client";
import "./index.css";

// Older installed Planner shortcuts used hash routes such as #/dashboard.
// Convert those once at boot so the browser router and the public/portal
// entry-point split see the same path on first launch.
if (window.location.hash.startsWith("#/")) {
  window.history.replaceState(null, "", window.location.hash.slice(1));
}

const pathname = window.location.pathname;
const isMarketingRoute =
  pathname === "/" ||
  pathname === "/demo-access" ||
  pathname === "/privacy" ||
  pathname === "/knowledge-centre" ||
  pathname.startsWith("/knowledge-centre/");

const appModule = isMarketingRoute ? import("./PublicApp") : import("./App");

appModule.then(({ default: App }) => {
  sessionStorage.removeItem("production-planner-boot-retry");
  createRoot(document.getElementById("root")!).render(<App />);
}).catch(async (error) => {
  console.error("Production Planner failed to start", error);

  // Installed PWAs can retain an older service-worker cache after a deploy.
  // Retry once with the old worker and caches removed instead of leaving a
  // completely blank standalone window.
  const retryKey = "production-planner-boot-retry";
  if (!sessionStorage.getItem(retryKey)) {
    sessionStorage.setItem(retryKey, "1");
    try {
      const registrations = await navigator.serviceWorker?.getRegistrations();
      await Promise.all(registrations?.map((registration) => registration.unregister()) ?? []);
      const cacheNames = await caches?.keys();
      await Promise.all(cacheNames?.map((cacheName) => caches.delete(cacheName)) ?? []);
      window.location.reload();
      return;
    } catch (recoveryError) {
      console.error("Production Planner cache recovery failed", recoveryError);
    }
  }

  document.getElementById("root")!.innerHTML = `
    <main style="min-height:100vh;display:grid;place-items:center;padding:24px;font-family:system-ui,sans-serif;text-align:center">
      <div>
        <h1 style="font-size:1.25rem;margin:0 0 8px">Production Planner could not load</h1>
        <p style="color:#666;margin:0 0 20px">Please refresh this window. If the problem continues, close and reopen the app.</p>
        <button onclick="location.reload()" style="padding:10px 16px;border:0;border-radius:6px;background:#4f46e5;color:white;font-weight:600;cursor:pointer">Refresh</button>
      </div>
    </main>
  `;
});
