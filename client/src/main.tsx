import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

console.log('[main.tsx] Starting React app...');
const rootElement = document.getElementById("root");
console.log('[main.tsx] Root element:', rootElement);

if (!rootElement) {
  document.body.innerHTML = '<div style="padding: 20px; color: red;">ERROR: Root element not found!</div>';
} else {
  try {
    createRoot(rootElement).render(<App />);
    console.log('[main.tsx] App rendered successfully');
  } catch (error) {
    console.error('[main.tsx] Error rendering app:', error);
    document.body.innerHTML = '<div style="padding: 20px; color: red;">ERROR: ' + error + '</div>';
  }
}
