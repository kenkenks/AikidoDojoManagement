Pages demo GAS pin - emergency safeguard

Purpose:
- Keep GitHub Pages connected to demo-gas even when main is pushed during DAO development.
- Do not modify individual HTML files.
- Generate web/qr/runtime_config.js inside the Pages workflow immediately before upload.

Apply:
1. Replace .github/workflows/pages.yml with the file in this ZIP.
2. Commit and push this change once.
3. Confirm GitHub Pages still connects to demo-gas.

Pinned demo Web App:
https://script.google.com/macros/s/AKfycbwtpuZUDHMescE7Sz71SiIHn4l-SH_DJwQtKCQb251d7qGnmhvIN0f1txRHMMjHm88ebQ/exec

Rollback:
- Remove the 'Pin GitHub Pages to demo GAS' step when formal multi-environment Pages deployment is implemented.

Scope:
- Only .github/workflows/pages.yml changes.
- Target Profile files and HTML files are unchanged.
