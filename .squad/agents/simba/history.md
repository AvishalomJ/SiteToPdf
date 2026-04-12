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
