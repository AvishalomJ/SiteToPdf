# Project Context

- **Owner:** AvishalomJ
- **Project:** SiteToPdf — A website crawler that takes a primary URL, traverses all paths under it, and generates a PDF containing all page content (excluding navigation menus and metadata).
- **Stack:** TypeScript + Playwright + Cheerio + Commander (finalized)
- **Created:** 2026-03-31

## Module Assignment

**Simba owns:** `src/fetcher.ts` — URL fetching via Playwright  
**Key dependency:** `types.ts` (owned by Mufasa) defines FetchResult contract  
**Phase 2 expansion:** Will implement `crawlSite(rootUrl)` for multi-URL traversal with cycle detection, normalization, and depth limits.

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### 2026-03-31 — Hardened fetcher + crawlSite foundation

- **Key file:** `src/fetcher.ts` — single module owns all HTTP/crawl logic.
- **fetchUrl()** now retries 3× with exponential backoff (1s, 2s, 4s). 5xx → retry, 4xx → fail fast, empty pages → retry.
- **FetchError** class classifies errors into: `network`, `timeout`, `http`, `empty-page`, `unknown`.
- **User-Agent** set to realistic Chrome string; applied in both fetchUrl and crawlSite contexts.
- **normalizeUrl()** strips fragments, removes default ports, collapses trailing slashes, resolves relative URLs.
- **discoverLinks(page, baseUrl)** extracts same-origin links via Playwright `$$eval`. Uses `getAttribute('href')` (not `.href`) to avoid TypeScript DOM type issues in Node context.
- **crawlSite(rootUrl, options)** does BFS traversal with visited set, configurable maxDepth (default 3), maxPages (default 50), rate limiting (default 500ms between requests).
- **CrawlOptions** interface kept local to fetcher.ts — types.ts untouched.
- fetchUrl signature is backward-compatible (options param is optional), so pipeline.ts works unchanged.
- Playwright `$$eval` runs callbacks in browser context — Node TS doesn't have DOM types. Use `getAttribute()` not property access.

- **2026-03-31:** Tech stack finalized by Mufasa. Playwright chosen for native JS rendering + built-in PDF support. Cheerio for fast extraction. TypeScript enforces contracts between modules.

### 2026-03-31 — URL-based output filenames + progress timer (Simba Sprint)

- **generateOutputFilename(url)** now derives filenames from hostname + pathname (not page title). Dots, slashes, underscores → hyphens, collapsed and trimmed, capped at 80 chars. E.g. `https://bradygaster.github.io/squad/docs/guide/` → `bradygaster-github-io-squad-docs-guide.pdf`.
- **Progress timer:** Both `runSingleUrl` and `runCrawl` start a one-shot 10-second `setTimeout`. If the pipeline hasn't completed in 10s, a reassuring `⏳ Still working...` message is printed once. Timer is cleared in a `finally` block so it never fires after completion or on error.
- Both features live in `src/pipeline.ts`. No changes to `fetcher.ts`, `index.ts`, or type contracts.
- The old `generateOutputFilename` accepted an optional `title` param and fell back to hostname only. New version always uses hostname + pathname for more predictable, URL-representative filenames.
- **Orchestration log:** `.squad/orchestration-log/2026-03-31T12-26-simba.md`

### 2026-03-31 — Added `--compress` flag wiring

- Added `compress?: boolean` to `PdfOptions` interface in `src/types.ts` — ensures the flag can pass through the entire pipeline to Rafiki's PDF generator.
- Added `--compress` CLI option to both `fetch` and `crawl` commands in `src/index.ts` — users can now enable compressed layout with a simple flag.
- Added `compress?: boolean` to both `PipelineOptions` and `CrawlPipelineOptions` in `src/pipeline.ts` — passes the compress value through to the `PdfOptions` object that gets sent to `generatePdf()` and `generateMultiPagePdf()`.
- This is pure wiring work — no business logic. The actual PDF compression implementation lives in Rafiki's `pdf-generator.ts`.
- Flag is optional (boolean), defaults to undefined (falsy) when not provided, maintaining backward compatibility.

### 2026-03-31 — Compress feature complete (Team: Simba + Rafiki)

- **Simba outcome:** CLI flag wired end-to-end through index.ts → pipeline.ts → types.ts ✓
- **Rafiki outcome:** COMPRESSED_STYLES implemented in pdf-generator.ts (smaller fonts, reduced margins/spacing) ✓
- **Integration:** Full pipeline from user input to compressed PDF output verified
- **Backward compatible:** Feature is opt-in; existing behavior unchanged when flag omitted
- **Orchestration logs:** `.squad/orchestration-log/2026-03-31T1253-{simba,rafiki}.md`
- **Session log:** `.squad/log/2026-03-31T1253-compress-feature.md`

### 2026-03-31 — Translation feature implementation (Simba Sprint)

- **New file:** `src/translator.ts` — translation module using `google-translate-api-x` (free, no API key).
- **translateContent()** translates title, contentHtml, and textContent in parallel via `Promise.all`. Stores original title in `originalTitle` field for PDF generator reference.
- **HTML chunking:** Large HTML is split at block-element boundaries (`</p>`, `</div>`, etc.) into ≤4000-char chunks before translation to avoid API limits. Tags are preserved by the API's `autoCorrect` mode.
- **Error handling:** If translation fails for any reason, original content is returned with a console warning — never crashes the pipeline.
- **Types updated:** `ExtractedContent` gained `originalTitle?: string`; `PdfOptions` gained `translate?: string`.
- **CLI wiring:** `--translate <lang>` added to both `fetch` and `crawl` commands in `index.ts`.
- **Pipeline wiring:** `translate?: string` added to `PipelineOptions` and `CrawlPipelineOptions`. Translation runs after extraction, before PDF generation. Crawl mode logs per-page translation progress.
- **Filename convention:** When translate is used, language code is appended to auto-generated filename (e.g., `example-com-he.pdf`). Composable with `--compress` suffix.
- **Dependency:** `google-translate-api-x` added to package.json.
- **Decision:** `.squad/decisions/inbox/simba-translate-feature.md` → merged to `.squad/decisions.md`
- **Orchestration log:** `.squad/orchestration-log/2026-03-31T1305-simba.md`

### 2026-04-XX — Electron Desktop Application (Simba Sprint)

- **New directory structure:** `electron/` with `main.js` (main process), `preload.js` (secure bridge), and `renderer/` (UI files).
- **Main process architecture:**
  - Creates BrowserWindow (1100×750, min 800×600) with contextIsolation and nodeIntegration:false for security
  - IPC handlers for `convert:single`, `convert:crawl`, `convert:list` → invoke pipeline functions from `dist/pipeline.js`
  - **Console log interception:** Monkey-patches `console.log/warn/error` during conversion to forward all pipeline progress messages to renderer via `webContents.send('progress', msg)`. Restores console in finally block.
  - **Browser cleanup:** Calls `shutdown()` after each conversion and on app quit to prevent zombie Playwright processes
  - Dialog handlers for save path selection, opening PDF, and opening containing folder
  - App menu with File > Quit and Help > About
- **Preload script:** Uses `contextBridge.exposeInMainWorld` to securely expose IPC API to renderer: `convertSingle`, `convertCrawl`, `convertList`, `chooseSavePath`, `openFile`, `openFolder`, `onProgress`, `onError`, `onComplete`
- **UI (renderer/):**
  - Modern card-based layout with gradient header, dark mode support via `prefers-color-scheme`
  - Three conversion modes: Single URL, Crawl Site, URL List (dynamic form sections)
  - Options panel: page format (A4/Letter), compress toggle, translate dropdown, output path with browse button
  - Crawl-specific options: max depth, max pages, delay between requests
  - Real-time progress log area (scrollable, color-coded: info/success/warning/error, timestamped)
  - Result card with success/error display and action buttons (Open PDF, Open Folder)
  - Clean separation: `index.html` (structure), `styles.css` (modern responsive styling), `app.js` (frontend logic)
- **Package.json updates:**
  - Changed `main` to `electron/main.js` for Electron entry point (kept `bin` for CLI usage)
  - Added scripts: `electron`, `electron:dev`, `pack`, `dist`
  - Added electron-builder configuration: appId, productName, Windows NSIS installer setup, output to `release/` folder
  - Dependencies: `electron` and `electron-builder` installed as devDependencies
- **.gitignore:** Added `release/` to ignore electron-builder output
- **Build verification:** `npm run build` runs successfully, TypeScript compiles to dist/
- **Decision doc:** `.squad/decisions/inbox/simba-electron-app.md` documents architecture choices, IPC patterns, security model, and rationale for choosing Electron over alternatives (Tauri, native, web-based)
- **Key patterns:**
  - Progress forwarding via console interception is critical — pipeline uses `console.log`, must be intercepted in main process
  - IPC uses `ipcMain.handle()` (supports async) not `ipcMain.on()`
  - Error handling guarantees browser cleanup even on failures
  - UI state management: idle → converting → complete/error with proper button disabling
- **Cross-platform:** Electron provides Windows/Mac/Linux support with same codebase. Playwright browsers run in detached processes managed by main process lifecycle.

### Auto-Updater + Default Output Directory (Simba Sprint)

- **Auto-updater:** Added `electron-updater` (production dependency) for GitHub Releases-based auto-update.
  - `setupAutoUpdater()` in `main.js` checks for updates on app start, auto-downloads, and forwards `update-available` / `update-downloaded` events to renderer via IPC.
  - Renderer shows a dismissable notification bar: blue while downloading, green when ready to install with "Restart & Update" button.
  - `install-update` IPC handler calls `autoUpdater.quitAndInstall()` to apply the update.
  - Errors are silently logged — never interrupts user workflow. Offline/no-release scenarios handled gracefully.
- **electron-builder publish config:** Added `"publish": [{"provider": "github", "owner": "AvishalomJ", "repo": "SiteToPdf"}]` to `build` section in `package.json`. `electron-builder` will now upload release artifacts to GitHub Releases on `npm run dist`.
- **About dialog:** Now uses `app.getVersion()` instead of hardcoded "Version 0.1.0".
- **Default output directory:** `Documents/SiteToPdf` created at app startup via `ensureDefaultOutputDir()`.
  - `get:defaultOutputDir` IPC handler returns the path to renderer.
  - `withDefaultOutputDir()` wrapper in convert handlers temporarily changes CWD to default dir when no output path is specified — safe because conversions are serialized via `isConverting` flag.
  - `dialog:save` defaults to `Documents/SiteToPdf/<filename>` instead of bare filenames.
  - Renderer fetches default dir on load and sets it as placeholder text. Browse dialog starts in default dir.
  - Backward compatible — if user specifies a custom path, it's used as-is.
- **Preload bridge additions:** `getDefaultOutputDir()`, `installUpdate()`, `onUpdateAvailable()`, `onUpdateDownloaded()` exposed via `contextBridge`.
- **UI additions:** Update notification bar (`#updateBar`) in index.html with CSS styling for downloading/ready states. Output path placeholder shows actual default directory path.

### Gemini AI Summarization — Replace Translation Feature (Simba Sprint)

- **Removed:** Ollama-based translation feature — `translateSelect` from UI, `translate` option from crawlOptions in `main.js`, `translateSelect.value` from `commonOptions` in `app.js`.
- **Added Gemini API integration:** `callGeminiApi()` in `electron/main.js` uses Node.js `https` module to call `generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`. No extra dependencies.
- **IPC handler `summarize:content`:** Accepts `{ url, language }`, fetches page via existing `fetchUrl()` + `extractContent()`, sends text to Gemini, returns `{ success, summary, title }`. Content truncated to 30k chars for API limits.
- **Settings IPC handlers:** `settings:get-api-key` (returns masked key), `settings:set-api-key`, `settings:clear-api-key`. Key stored in `app.getPath('userData')/settings.json` — outside repo, local only.
- **Security:** API key never logged in full, never exposed to renderer, never committed. Gemini calls happen in main process only (CSP compliant). Key masked as `xxxx...xxxx` in UI.
- **New UI mode:** 4th mode button "Summarize" added to mode selector. Shows URL input + language dropdown (12 languages). Summary result displayed in styled `.summary-card` with left border accent.
- **Settings modal:** Gear icon button in header opens modal for API key management. Shows masked current key, save/clear buttons, link to Google AI Studio for key generation.
- **Preload additions:** `summarizeContent()`, `getApiKey()`, `setApiKey()`, `clearApiKey()` exposed via `contextBridge`.
- **CSS additions:** Settings button, modal overlay/card, settings form elements, summary card styles — all theme-aware (dark/light).
- **Key pattern:** `NO_API_KEY` error sentinel allows renderer to show friendly "configure your key" message instead of generic error.
- **Playwright cleanup:** Summarize handler uses `pipeline.js` `shutdown()` (not fetcher.js) for proper browser cleanup.

### Summarize PDF Generation (v0.4.1) — Simba Sprint

- **Feature:** Summarize mode now generates a PDF alongside the summary card UI.
- **main.js changes:**
  - `generateSummaryFilename(url, language)` derives filenames from URL hostname+pathname with `-summary` suffix. Non-English languages get a short code suffix (e.g., `-he`, `-es`). Max 70 chars for the URL portion.
  - `summaryToHtml(text)` converts Gemini's markdown-like output to simple HTML paragraphs with bold/italic support.
  - `summarize:content` handler now: fetches → extracts → calls Gemini → generates PDF → shuts down (single `shutdown()` at the end, not after fetch).
  - Returns `{ success, summary, title, outputPath }` — the new `outputPath` field tells the renderer where the PDF was saved.
  - PDF is saved to `Documents/SiteToPdf/` via `ensureDefaultOutputDir()`.
- **app.js changes:** `handleSummarize()` now calls `showResult(true, result.outputPath)` after `showSummary()`, so the user sees Open PDF / Open Folder buttons.
- **Key pattern:** `generatePdf()` from `dist/pdf-generator.js` is called with an `ExtractedContent`-shaped object — `{ title, contentHtml, textContent }`. The title is prefixed with "Summary: " for clarity in the PDF header.
- **Shutdown ordering:** `shutdown()` is called ONCE after both fetch+extract AND PDF generation complete. The previous code called it after fetch, before Gemini — that would have closed the PDF browser prematurely.
- **Version:** 0.4.0 → 0.4.1. Release: `v0.4.1` on GitHub with installer + blockmap + latest.yml.
- **Orchestration log:** `.squad/orchestration-log/2026-04-11T21-15-simba.md`

### PDF Merge Feature (v0.5.0) — Simba Sprint

- **Feature:** 5th mode "Merge PDFs" — select multiple PDF files, reorder, remove, merge into one.
- **Dependency:** `pdf-lib` (pure JS, no binary deps) added for PDF merging. No Playwright needed.
- **main.js additions:**
  - `dialog:open-pdfs` IPC handler — multi-select file dialog filtered to `*.pdf`.
  - `merge:pdfs` IPC handler — reads each PDF with `PDFDocument.load()`, copies pages via `copyPages()`, saves merged result. Uses `ignoreEncryption: true` for resilience.
  - Auto-generates `merged-YYYY-MM-DD-HHmmss.pdf` in `Documents/SiteToPdf/` when no custom output path specified.
  - Sends per-file progress messages to renderer.
- **preload.js additions:** `openPdfFiles()`, `mergePdfs(options)` bridges.
- **index.html additions:** 5th mode button, `#mergeSection` with Add PDF Files button and `#mergeFileList` container. Added `id` attributes to `formatGroup` and `compressGroup` for per-mode visibility control.
- **app.js additions:**
  - `mergeFiles` state array, `renderMergeFileList()` with reorder/remove controls.
  - `handleMerge()` validates ≥2 files, calls `mergePdfs`, plays success sound.
  - `updateVisibleSections()` hides URL inputs, format, compress for merge mode; keeps output path visible.
  - `setConverting()` handles merge mode button text ("Merging..." / "Merge PDFs").
- **styles.css additions:** `.merge-file-list`, `.merge-file-item`, `.merge-file-actions`, `.merge-btn-move`, `.merge-btn-remove`, `.merge-empty-state` — all using existing CSS variables.
- **Key patterns:**
  - Merge doesn't touch `isConverting` in main.js until the handler starts, same pattern as convert handlers.
  - File dedup in renderer prevents adding same path twice.
  - `formatGroup`/`compressGroup` hidden in merge mode since they're irrelevant for PDF merging.
- **Version:** 0.4.1 → 0.5.0. Release: `v0.5.0` on GitHub with installer + blockmap + latest.yml.

### 2026-04-16 — Web API Server + Aspire AppHost (Phase 1 MVP)

- **New directory:** `web/server/` — Fastify HTTP API server for web-based PDF conversion.
- **Server architecture:** Fastify 5 with CORS, static file serving from `web/frontend/`, health endpoint at `/health`.
- **Job-based pattern:** All conversion/summarize routes return `{ jobId }` immediately, run work asynchronously. SSE (`text/event-stream`) streams real-time progress. Download endpoint streams PDF then cleans up.
- **Routes:**
  - `POST /api/convert/single` — single URL → PDF via `runSingleUrl()`
  - `POST /api/convert/crawl` — crawl site → combined PDF via `runCrawl()`
  - `POST /api/convert/list` — URL list → combined PDF via `runList()`
  - `POST /api/summarize` — fetch + extract + Gemini summarize → summary PDF
  - `GET /api/jobs/:id/status` — SSE progress stream
  - `GET /api/jobs/:id/download` — PDF download + cleanup
  - `GET /health` — health check with uptime and version
- **Services:**
  - `job-manager.ts` — in-memory Map, EventEmitter for SSE, UUID generation, TTL cleanup (configurable via `JOB_TTL_MINUTES` env, default 60m).
  - `browser-pool.ts` — semaphore-based concurrency control (`MAX_CONCURRENT_BROWSERS` env, default 2), queue at capacity, 5-minute per-job timeout.
  - `gemini.ts` — extracted `callGeminiApi()`, `callGeminiWithRetry()`, `summaryToHtml()`, `GEMINI_MODELS` from `electron/main.js`. TypeScript typed. API key is per-request (from client), never stored server-side.
- **Console capture pattern:** `withConsoleCapture()` monkey-patches `console.log/warn` during pipeline execution to forward messages to job manager as progress updates. Restores originals in `finally` block. Same pattern as Electron's IPC progress forwarding.
- **Pipeline imports:** Server uses `require()` at runtime to load compiled `dist/pipeline.js`, `dist/fetcher.js`, etc. The server TypeScript compiles separately to `dist/web/server/`.
- **Aspire AppHost:** `aspire/SiteToPdf.AppHost/` uses `Aspire.AppHost.Sdk/13.2.2` (NuGet-based, not workload-based — Aspire workload is deprecated in .NET 10). `AddDockerfile()` builds and runs the Node.js container. HTTP endpoint on port 3000, health check at `/health`, env vars for `NODE_ENV`, `MAX_CONCURRENT_BROWSERS`, `JOB_TTL_MINUTES`.
- **Dockerfile:** `node:20-slim`, installs Playwright Chromium with OS deps, two-stage npm install (root + server), builds both TypeScript projects, exposes port 3000.
- **Key decisions:**
  - Aspire SDK 13.2.2 (not 9.x) — the `Aspire.Hosting.NodeJs` package was renamed to `Aspire.Hosting.JavaScript`, but `AddDockerfile()` from base `Aspire.Hosting.AppHost` is sufficient for containerized Node.js.
  - `.slnx` format (new .NET 10 default) instead of `.sln`.
  - Added `**/bin/` and `**/obj/` to `.gitignore` for .NET build artifacts.
  - Server has its own `tsconfig.json` with `outDir: ../../dist/web/server` — separate from root tsconfig.
  - No existing files modified — purely additive.
- **Build verification:** Root `npm run build` ✓, server `npx tsc` ✓, Aspire `dotnet build` ✓.

### SSE Named Events Fix — "Connection to server lost" bug

- **Bug:** Server sent unnamed SSE events (`data: ...\n\n`), but frontend `EventSource` listened for named events (`progress`, `complete`, `error`). Unnamed events dispatch as `message` events — the named listeners never fired, so the connection would close and the client showed "Connection to server lost".
- **Fix:** Added `event: progress\n`, `event: complete\n`, or `event: error\n` prefixes before each `data:` line in `web/server/routes/jobs.ts`. Four write points updated: existing progress replay, terminal-state-on-connect, live progress callback, and done callback.
- **SSE spec pattern:** Named events require `event: {name}\ndata: {payload}\n\n`. Without the `event:` line, browsers fire the generic `message` event, not the named one. This is a common SSE mismatch bug.
- **File changed:** `web/server/routes/jobs.ts` — all 4 `reply.raw.write()` calls in the SSE endpoint.
- **Build verified:** `npx tsc --project tsconfig.json` ✓, compiled output at `dist/web/server/routes/jobs.js` confirmed with `event:` prefixes.

### 2026-04-XX — Backend Fixes and Image-to-PDF Endpoint

- **Crawl bug fix:** Server route for /api/convert/crawl now accepts both url and startUrl parameters. Frontend sends startUrl, but now the server destructures both and uses url || startUrl for backward compatibility.
- **Readable filenames (F3):**
  - Added displayFilename?: string field to Job interface in job-manager.ts.
  - Updated completeJob() to accept optional displayFilename parameter.
  - Added urlToSlug() helper in convert.ts — converts URL (hostname + pathname) to filesystem-friendly slug, 60 chars max.
  - All three conversion routes (single, crawl, list) now generate readable filenames:
    - Single: {slug}-{jobId-8chars}.pdf on disk, {slug}.pdf as displayFilename
    - Crawl: {slug}-{jobId-8chars}.pdf on disk, {slug}.pdf as displayFilename
    - List: {slug}-combined-{jobId-8chars}.pdf on disk, {slug}-combined.pdf as displayFilename
  - SSE complete events now include jobId and displayFilename in JSON payload.
  - Download endpoint (/api/jobs/:id/download) uses displayFilename (if available) in Content-Disposition header instead of raw temp filename.
- **PDF formatting fix (F5):**
  - Root cause: SSE complete event was sending outputPath but not jobId, so frontend could not construct download URL.
  - Fix: Both SSE completion paths (terminal state on connect, and live done callback) now include jobId in the JSON payload.
  - Added file existence check in download endpoint — returns 404 error if file is missing (instead of crashing).
- **Image-to-PDF endpoint (FT2):**
  - Installed @fastify/multipart in web/server/package.json.
  - Registered multipart plugin in server.ts with limits: max 50 files, 20MB per file.
  - New route file: web/server/routes/images.ts with POST /api/convert/images-to-pdf.
  - Endpoint accepts multipart file uploads, validates MIME types (image/png, image/jpeg, image/jpg).
  - Uses pdf-lib (from root dependencies) to create a PDF with one page per image, sized to image dimensions.
  - Returns jobId immediately, runs asynchronously, saves to temp dir as images-{jobId-8chars}.pdf.
  - Follows same job-based pattern as other conversion routes.
- **Build verification:** Root npm run build verified, server npx tsc verified, no TypeScript errors.
- **Key patterns:**
  - urlToSlug() reuses the same logic as pipeline generateOutputFilename() but returns just the slug part (no .pdf extension, no suffixes).
  - JobId suffix in disk filenames prevents collisions, while displayFilename gives users clean download names.
  - SSE events must include jobId so frontend can construct download URLs — the outputPath is server-side only.

