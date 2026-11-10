# MNH Calendar package audit

**Package audited:** `MNH-Calendar-Full-Navigation-Functional.zip`  
**Audit date:** 10 November 2026  
**Result:** Core Python and JavaScript checks pass; corrections and offline web support are included in this package.

## Corrections made

1. Removed `attributes: true` from the calendar clash-check observer. The observer's callback changes CSS classes, so watching attributes caused a recursive mutation loop and could freeze the browser.
2. Added a root-scoped service worker and FastAPI route. The worker caches the same-origin HTML, CSS and JavaScript shell and deliberately bypasses API requests.
3. Reworked the browser API client to cache collection reads, persist offline document writes, apply queued writes over cached/server collection reads, and retry writes when connectivity returns. Newer edits are sent only after older queued edits have been attempted, preventing an older queued value from overwriting a newer edit.
4. Updated timetable, module, resource and header writes to use the offline-capable API even when the first server connection has not yet been established.
5. Added reconnect handling and user-facing offline/synchronisation status messages.
6. Disabled the development-only `rep` and `staff` fallback passwords when `MNH_ENV=production`; the Render Blueprint now sets production mode. Explicit production passwords must be configured.
7. Made backup restoration reject duplicate document IDs before deleting existing records.
8. Added bounds for session duration, backup interval and backup retention settings.
9. Added a root pytest configuration, API integration tests, offline queue tests, development requirements, and editor formatting profiles.
10. Added `defer` to the optional PDF library CDN scripts so they do not block initial HTML parsing.

## Verification performed

| Check | Result |
|---|---|
| Python bytecode compilation (`compileall`) | Passed |
| Python automated tests (`python -m pytest -q`) | 17 passed |
| Browser application JavaScript syntax (`node --check`) | Passed |
| API client JavaScript syntax (`node --check`) | Passed |
| Service worker JavaScript syntax (`node --check`) | Passed |
| Offline API queue simulation | Passed |
| Offline queue ordering and authentication-rejection checks | Passed |
| CSS parser check | 303 top-level rules; 0 parse errors |
| HTML parser check | Passed |
| Render and Flutter YAML parsing | Passed |
| Duplicate HTML IDs | None found |
| Local HTML asset references | Resolved in package |
| Placeholder/secret-marker scan | No matches |
| UTF-8, trailing whitespace and final newline check | Passed |
| FastAPI asset/API integration checks | Passed |

## Important scope and remaining limitations

- The offline cache and automatic write queue in this release apply to the **web browser client**. The Flutter client still requires a network connection; it has not been given an offline write queue.
- The browser shell and cached data must have been loaded online at least once. Do not clear this site's browser storage while writes are queued.
- Service workers work on HTTPS or localhost. A plain HTTP LAN address such as `http://192.168.x.x:8000` is not a secure context and will not register the worker.
- Google Fonts, html2canvas and jsPDF are external CDN dependencies and are not cached in this release. PDF export may therefore require internet access.
- The displayed academic week remains fixed at 9–13 November 2026 in the existing web and Flutter schedule views. This audit preserved that programme-week design rather than changing the academic calendar model.
- The Flutter SDK was not available in the audit environment, so `flutter analyze` and a native build could not be run. Dart source was inspected but is not certified by a compiler run here.
- The interactive browser UI was not fully exercised end-to-end. The backend/API integration and browser JavaScript/offline queue logic were tested independently; the next step is the user's VS Code/browser acceptance test.
- Editing sessions are held in process memory and are cleared by a backend restart. The included Render setup is a single service instance; do not scale this SQLite-backed service to multiple independent workers/instances.
- `/api/backup` and `/api/export` remain public read/export endpoints, consistent with the package's open-view calendar design. They expose shared calendar records; do not store sensitive personal information in those collections.
- Local development retains the existing `rep` and `staff` passwords for compatibility. Do not expose a development-mode server to the public internet.
- The `/v1/models` request seen in the user's earlier server log is not referenced by this ZIP's source code and is not an endpoint implemented by this backend. It is separate from the calendar cache and clash-observer defects.

## Recommended VS Code test sequence

1. Extract this ZIP into a **new folder** so the current project and browser data are not overwritten.
2. Install dependencies using the commands in the root `README.md`.
3. Start the backend using `python backend\\run.py`.
4. Open `http://127.0.0.1:8000/` and confirm the calendar loads and remains responsive.
5. In Chrome DevTools → Application → Service Workers, confirm `/service-worker.js` is activated; in Cache Storage, confirm `mnh-calendar-shell-v6` exists.
6. With the server available, unlock editing and make a timetable change. Then stop the backend, make another change, and confirm the UI reports that it is saved locally and waiting to sync.
7. Restart the backend and confirm the queued change reaches the shared timetable without losing the earlier entries.
8. Repeat with a resource or module if those sections are in use.

Do not test offline synchronisation by clearing site data; that would delete the local queue being tested.
- **Formatting qualification:** UTF-8, LF endings, final newlines and trailing whitespace were normalized/checked, and `.editorconfig` plus `.prettierrc.json` were added. The original large `app.js` and Flutter screen still contain compact legacy formatting. A full formatter pass was not possible because Prettier and the Flutter/Dart formatter were unavailable in the audit environment; I did not risk rewriting those files with an unsafe text-only formatter.
