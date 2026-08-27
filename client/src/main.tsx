import { createRoot } from "react-dom/client";
import "./index.css";

const pathname = window.location.pathname;
const isMarketingRoute =
  pathname === "/" ||
  pathname === "/demo-access" ||
  pathname === "/privacy" ||
  pathname === "/knowledge-centre" ||
  pathname.startsWith("/knowledge-centre/");

const appModule = isMarketingRoute ? import("./PublicApp") : import("./App");

appModule.then(({ default: App }) => {
  createRoot(document.getElementById("root")!).render(<App />);
});
