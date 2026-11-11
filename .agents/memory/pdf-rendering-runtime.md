---
name: PDF rendering runtime
description: Chromium-based PDF rendering on the Replit Nix runtime.
---

Use the Nix-installed Chromium executable for server-side HTML-to-PDF rendering rather than an AWS Lambda Chromium binary.

**Why:** Lambda-targeted Chromium binaries cannot find required shared libraries such as libnspr4.so on this Nix host. The system Chromium rendered the same courier label successfully.

**How to apply:** Keep Chromium declared as a system dependency for publishing, resolve its executable from PATH, disable page JavaScript, and block external requests when rendering third-party label HTML.
