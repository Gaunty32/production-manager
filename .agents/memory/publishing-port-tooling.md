---
name: Publishing port and tooling
description: Non-obvious deployment port ordering and preview-plugin build constraints.
---

The primary app port must be the first configured local port; auxiliary ports must follow it.

**Why:** Replit's publishing failure reported that readiness checks use the first configured local port. The app listened on 5000 while an auxiliary 3001 mapping came first.

**How to apply:** Preserve the primary mapping first when adding preview services or other ports. Do not infer that a passing build proves deployment readiness.

Use Vite's `command === "serve"` to enable preview-only tooling rather than relying solely on `NODE_ENV`.

**Why:** A publishing build loaded Cartographer and produced repeated `traverse is not a function` errors even though compilation completed. The build command is authoritative regardless of inherited environment settings.

**How to apply:** Keep Cartographer, the development banner and runtime-error overlay out of production bundles.

Resolve command-aware Vite configuration before passing it to the embedded preview server.

**Why:** Spreading a configuration factory as an object silently discards the client root. With automatic config loading disabled, the preview then looks in the workspace root and cannot find its entry file.

**How to apply:** Check both the CLI build and the embedded development server whenever changing the Vite configuration export shape.
