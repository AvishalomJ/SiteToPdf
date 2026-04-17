# Project Context

- **Owner:** AvishalomJ
- **Project:** SiteToPdf — A website crawler that takes a primary URL, traverses all paths under it, and generates a PDF containing all page content (excluding navigation menus and metadata).
- **Stack:** TypeScript + Playwright + Cheerio + Commander (finalized)
- **Created:** 2026-03-31

## Module Assignment

**Rafiki owns:** `src/extractor.ts` (content extraction) and `src/pdf-generator.ts` (PDF rendering)  
**Key dependencies:** `types.ts` (owned by Mufasa) defines ExtractedContent and PdfOptions contracts  
**Extraction strategy:** Cheerio for DOM parsing and nav/menu stripping. Playwright's `page.pdf()` for high-fidelity PDF rendering.  
**Phase 2 expansion:** Will handle multi-page PDF combination and advanced extraction rules.

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### 2026-03-31 — Production extractor & PDF generator

**extractor.ts:**
- Expanded noise selectors to ~60+ patterns covering cookie banners, GDPR, modals, social widgets, ads, comments, newsletters, announcement bars.
- Content detection uses a 3-strategy cascade: (1) known selectors in priority order, (2) readability-style scoring on div/section candidates (text length, paragraph count, heading count, link-density penalty), (3) fallback to `<body>`.
- HTML cleanup: removes empty elements (3-pass), strips `data-*` and `on*` attributes, collapses whitespace.
- Accepts optional `baseUrl` second param to resolve relative URLs (backward compatible).
- Handles edge cases: empty HTML input, empty extracted content, pages with no main content area.
- Cheerio's `Element` and `AnyNode` types come from `domhandler` (transitive dep), not from `cheerio` namespace directly.

**pdf-generator.ts:**
- Professional CSS: Georgia serif at 11pt, 1.7 line-height, proper heading hierarchy with page-break-after: avoid, orphans/widows on paragraphs.
- Page numbers in footer via Playwright's `displayHeaderFooter` + `footerTemplate` with `.pageNumber` / `.totalPages` classes.
- Source URL and generation date rendered in a `.meta-block` div in the document body (more reliable than header template for long URLs).
- Header template shows truncated title + date.
- Images: `max-width: 100%; height: auto; page-break-inside: avoid`. Figures and code blocks also avoid page breaks.
- `generateMultiPagePdf(pages: PageEntry[], options: PdfOptions)` — Phase 2 ready. Builds cover page, TOC with links, and page-separated content sections.
- All original export signatures preserved (`generatePdf`, `closePdfBrowser`). `generateMultiPagePdf` is additive.

**Key paths:** `src/extractor.ts`, `src/pdf-generator.ts`, `src/types.ts` (read-only contracts), `src/pipeline.ts` (orchestration, read-only).

- **2026-03-31:** Tech stack finalized by Mufasa. Cheerio chosen for extraction (fast, lightweight). Playwright's `page.pdf()` for PDF rendering (no separate lib needed).

### 2026-03-31 — Footer page number refinements (Rafiki Sprint)

- Updated `HEADER_FOOTER_BASE_STYLE` font from `8pt "Segoe UI"` to `9px Arial` per user spec — Playwright header/footer templates need explicit inline `font-size` to render.
- Increased bottom margin from `22mm` to `25mm` in both `generatePdf()` and `generateMultiPagePdf()` to give the "Page X of Y" footer comfortable breathing room.
- Playwright quirk: `displayHeaderFooter: true` requires both `headerTemplate` and `footerTemplate` to be set, even if one is empty. Our code already handled this correctly.
- **Orchestration log:** `.squad/orchestration-log/2026-03-31T12-26-rafiki.md`

### 2026-03-31 — Compress mode implementation

**Context:** Added optional `compress` mode to the PDF generator to fit more content per page when enabled. Simba is updating `PdfOptions` interface to include `compress?: boolean`.

**Implementation:**
- Created `COMPRESSED_STYLES` constant with dense layout values:
  - Body: 9pt font (was 11pt), 1.35 line-height (was 1.7)
  - Code blocks: 8pt (was 9pt), padding 8px 10px (was 14px 16px)
  - Headings: h1 17pt (was 22pt), h2 14pt (was 17pt), h3 12pt (was 14pt), h4+ 10pt (was 12pt)
  - Line heights: 1.15 for headings (was 1.3), 1.35 for body (was 1.7)
  - Spacing: paragraphs 0.4em (was 0.8em), heading margins ~60% of original
  - Tables/blockquotes: 8.5pt (was 10pt for tables)
- Updated `wrapInHtmlDocument()` and `wrapMultiPageDocument()` to accept optional `compress` parameter
- Modified `buildHeaderTemplate()` and `buildFooterTemplate()` to use 8px font when compressed (was 10px)
- Updated `generatePdf()` and `generateMultiPagePdf()` to:
  - Read `options.compress` (defaults to false)
  - Pass compress flag to wrapper functions
  - Use smaller margins when compressed: 15mm top/bottom, 12mm left/right (was 25mm/18mm)
- Default behavior unchanged when `compress` is false or undefined — backward compatible

**Key decision:** Compress mode is additive. Existing PDFs continue to use spacious, readable layout unless explicitly opted in.

### 2026-03-31 — Compress feature complete (Team: Simba + Rafiki)

- **Simba outcome:** CLI flag wired end-to-end through index.ts → pipeline.ts → types.ts ✓
- **Rafiki outcome:** COMPRESSED_STYLES implemented in pdf-generator.ts (smaller fonts, reduced margins/spacing) ✓
- **Integration:** Full pipeline from user input to compressed PDF output verified
- **Backward compatible:** Feature is opt-in; existing behavior unchanged when flag omitted
- **Orchestration logs:** `.squad/orchestration-log/2026-03-31T1253-{simba,rafiki}.md`
- **Session log:** `.squad/log/2026-03-31T1253-compress-feature.md`

### 2026-03-31 — RTL (Right-to-Left) support for Hebrew translation

**Context:** Added RTL layout support to the PDF generator for the `--translate he` feature. When `options.translate` is set to an RTL language (he, ar, fa, ur), the entire PDF layout flips to right-to-left.

**Implementation:**
- `isRtlLanguage(lang?)` helper detects RTL language codes (he, ar, fa, ur)
- `buildRtlStyles(compress?)` generates CSS overlay layered on top of base styles:
  - Body: `direction: rtl; text-align: right;` with Hebrew-friendly font stack (`Segoe UI`, `Arial Hebrew`, `Noto Sans Hebrew`)
  - Line-height bumped to 1.8 (normal) / 1.45 (compressed) for Hebrew readability
  - List padding swapped from left to right, blockquote border flipped to right side
  - TOC list padding swapped
  - Code blocks (`pre`, `code`) forced LTR with `unicode-bidi: bidi-override`
  - URLs and technical content (`a[href]`, `.page-url`, `.toc-url`) forced LTR with `unicode-bidi: embed`
  - Cover page explicitly keeps `text-align: center`
- `wrapInHtmlDocument()` and `wrapMultiPageDocument()` accept optional `translate` parameter:
  - Sets `<html lang="{lang}" dir="rtl">` for RTL languages
  - Concatenates RTL styles after base styles (CSS cascade override)
- Bilingual title display: when `content.originalTitle` is present and RTL is active, shows translated title as main H1 and original title below in 9pt italic gray annotation (`Original: {source title}`)
- Header/footer templates accept `rtl` flag: header gets `direction: rtl`, footer text-align switches to `right`
- `generatePdf()` and `generateMultiPagePdf()` read `options.translate`, derive `rtl` flag, and pass through to all sub-functions
- **Backward compatible:** Default (no translate) behavior is unchanged. `PDF_STYLES` and `COMPRESSED_STYLES` constants untouched.
- **Compress + RTL:** Both modes compose cleanly — compressed sizing with RTL layout and adjusted line-height (1.45 instead of 1.8)

**Key design choice:** RTL styles are a CSS overlay, not a separate complete stylesheet. This avoids duplicating the ~300 lines of base styles and ensures future style changes automatically carry over to RTL mode. The `buildRtlStyles()` function adjusts line-height and blockquote padding based on compress mode for correct proportional scaling.

- **Decision:** `.squad/decisions/inbox/rafiki-rtl-support.md` → merged to `.squad/decisions.md`
- **Orchestration log:** `.squad/orchestration-log/2026-03-31T1305-rafiki.md`
- **Session log:** `.squad/log/2026-03-31T1305-translate-feature.md`

### 2026-04-11 — Summarize feature extended with PDF generation

**Context:** Simba extended Gemini AI summarization to generate PDFs in addition to on-screen cards, matching the behavior of other conversion modes.

**Integration with Rafiki's `generatePdf()`:**
- Summarize handler reuses existing `generatePdf()` function from `dist/pdf-generator.js` (Rafiki's domain)
- Summary text converted to HTML via helper `summaryToHtml()`
- Calls `generatePdf()` with mock `ExtractedContent` object: `{ title, contentHtml: html, textContent: text }`
- If `ExtractedContent` contract changes, the summary handler's mock object shape must be updated to match

**Key decision:** PDF generation for summaries (Simba) depends on `generatePdf()` contract (Rafiki owns). Coordination required for any changes to `ExtractedContent` interface.

- **Orchestration log:** `.squad/orchestration-log/2026-04-11T21-15-simba.md`
- **Session log:** `.squad/log/2026-04-11T21-15-summarize-pdf.md`

### 2026-04-16 — PDF Merge Feature (v0.5.0) — Simba Implementation Note

**Context:** Simba implemented PDF merge feature (5th UI mode) using `pdf-lib` library for combining multiple PDF files.

**Note for Rafiki:** `pdf-lib` is a pure JavaScript PDF manipulation library now added to `package.json` as a production dependency. It provides PDF reading/writing without Playwright or native binaries. If future features require PDF operations (page extraction, rotation, annotation), `pdf-lib` already supports those. The merge handler in Simba's domain doesn't touch Rafiki's PDF generation code — they're independent.

- **New dependency:** `pdf-lib` (pure JS, no binary deps)
- **Orchestration log:** `.squad/orchestration-log/2026-04-16T0635-simba.md`

### 2026-04-16 — Web frontend created (web/frontend/)

**Context:** Created the web frontend for SiteToPdf as part of the Aspire web deployment initiative. The web version mirrors the Electron desktop app's UI but replaces IPC calls with HTTP API + SSE.

**Files created:**
- `web/frontend/index.html` — Full UI with mode selector (5 modes), form inputs, progress/result/summary cards, settings modal. Removed update bar and check-for-update button. Added "Web" badge in header. CSP allows `connect-src 'self'` for API calls. Settings link is now a real `<a>` tag (not a span).
- `web/frontend/styles.css` — Copied from Electron with update-bar styles removed. Added `.web-badge` styling, `.btn-download` for PDF download buttons, `.merge-file-size` for file size display.
- `web/frontend/app.js` — Complete rewrite of the Electron app.js:
  - `window.siteToPdf.*` IPC calls → `fetch()` POST to `/api/convert/single`, `/api/convert/crawl`, `/api/convert/list`, `/api/summarize`
  - IPC progress events → `EventSource` SSE on `/api/jobs/{jobId}/status` (listens for `progress`, `complete`, `error` events)
  - File open/folder open → Download link via `/api/jobs/{jobId}/download`
  - File save dialog / Browse button → Removed (not applicable on web)
  - Output path field → Removed (server decides output location)
  - API key storage: `localStorage` (keys: `sitetopdf_gemini_api_key`, `sitetopdf_gemini_model`)
  - API key is only sent in POST body for `/api/summarize` requests — never for other endpoints
  - Merge PDFs: uses `<input type="file" multiple accept=".pdf">` instead of Electron file dialog; reads files as base64 for POSTing to `/api/merge`
  - All Electron-only features removed: auto-update, update bar, installUpdate, checkForUpdate, openFile, openFolder, chooseSavePath
  - All shared features preserved: mode switching, progress logging with timestamps/colors, clear log, success sound, settings modal, summary card, form validation

**Key design decisions:**
- Self-contained static files — no build step, no npm, just HTML/CSS/JS served as-is
- Same visual design as desktop app — users feel at home
- Merge endpoint marked as Phase 2 TODO — frontend code is ready, waiting for Simba's backend
- API key client-side validation: summarize mode checks for key before making the API call
- SSE connection is tracked in `activeEventSource` and properly cleaned up between jobs

### 2026-04-17 — Duplicate title fix & Gmail button

**Duplicate h1 fix (extractor.ts):**
- After `findMainContent()`, the extractor now checks the first `<h1>` inside content. If its text matches the extracted title (case-insensitive), it removes that `<h1>`.
- This prevents double-title in PDFs since `pdf-generator.ts` already adds a styled `<h1>` in `wrapInHtmlDocument()` (line ~474) and `wrapMultiPageDocument()` (line ~523).
- Safe: only removes if text actually matches, so non-title h1 elements are preserved.

**Gmail button (web + electron):**
- `web/frontend/app.js` `showResult()`: Added "Send via Gmail" link using `mailto`-style Gmail compose URL (`mail.google.com/mail/?view=cm`). Body includes the full download link since Gmail can't programmatically attach files.
- `electron/renderer/app.js` `showResult()`: Added "Send via Gmail" button using `window.open()` (preload API has no `openExternal`, so standard `window.open` suffices). Body includes the local file path for manual attachment.
- `web/frontend/styles.css`: `.btn-gmail` class with Gmail red (`#ea4335`).

**Key paths modified:** `src/extractor.ts`, `web/frontend/app.js`, `web/frontend/styles.css`, `electron/renderer/app.js`

### 2026-04-17 — Web frontend UI enhancements (7 features)

**Context:** Completed comprehensive web frontend UI improvements across all 7 requested items — F1 (loading overlay), F2 (logo/favicon), F3 (readable filename display), F4 (improved Gmail compose), FT1 (two-level nav structure), FT2 (image-to-PDF UI), and visibility updates.

**Implementation:**

**F1 — Loading Overlay:**
- `setConverting()` function now adds/removes `.converting` class on `.form-card` element
- CSS: `.form-card.converting` disables pointer events, reduces opacity to 0.7, and shows animated progress bar via `::before` pseudo-element
- Progress bar uses sliding gradient animation (`progress-slide` keyframe: translateX -100% to 100%, 1.5s duration)
- Visual feedback is immediate and non-intrusive during conversion

**F2 — Logo & Favicon:**
- Replaced inline SVG header icon (document with download arrow) with cleaner, PDF-themed icon using stroke-width 1.8
- Created `web/frontend/favicon.svg` with filled light blue background (#e0e7ff) and blue stroke (#3b82f6)
- Added `<link rel="icon" type="image/svg+xml" href="favicon.svg">` to `<head>`
- Maintains gradient header styling, improves brand consistency

**F3 — Readable Filename Display:**
- Updated `showResult()` to handle both string jobId and object `{ jobId, displayFilename }`
- Success message now shows "✅ PDF generated: {filename}" with the readable filename
- Filename uses `displayFilename` from SSE complete event if available, otherwise falls back to `SiteToPdf-{jobId}.pdf`
- Download link uses `download="${filename}"` attribute for browser-friendly filename
- SSE `connectJobSSE()` already passes through complete event data properly

**F4 — Improved Gmail Compose:**
- Gmail subject: `SiteToPdf: {filename}` (uses readable filename from F3)
- Gmail body updated to friendly, professional template mentioning the filename explicitly
- Removed download URL from body (ephemeral and would be dead by email send time)
- Body includes note: "PDF file needs to be attached manually after opening this email draft"
- Button remains styled with Gmail red (#ea4335)

**FT1 — Two-Level Navigation:**
- Added nav-tab system: "Convert" and "Tools" top-level groups
- Convert group contains: Single URL, Crawl Site, URL List
- Tools group contains: Merge PDFs, Summarize, Image → PDF
- Nav tabs styled with bottom border indicator (2px solid primary when active)
- Mode buttons now grouped under `#convertModes` and `#toolsModes` divs (one visible at a time)
- Nav tab switching logic switches visible mode-selector div and auto-selects first mode in new group if needed
- `updateModeButtons()` helper function keeps mode buttons in sync across both groups
- CSS: `.nav-tabs` flex container with border-bottom, `.nav-tab` uses icon + text layout with active state styling

**FT2 — Image to PDF UI:**
- Added `#imageSection` in HTML with file input (accept: image/png,image/jpeg), "Add Images" button, and file list display
- Image file list reuses `.merge-file-list` CSS classes (consistent with merge UI)
- State: `imageFiles` array stores File objects
- File handling: deduplication by name + size, drag-to-reorder with up/down buttons, remove button
- `renderImageFileList()` displays numbered list with filename, file size, and action buttons
- `handleImageToPdf()` function:
  - Validates at least 1 image selected
  - Creates FormData and appends all files with key `images`
  - POSTs to `/api/convert/images-to-pdf`
  - Receives jobId, connects SSE, shows result
- Form submit handler checks `currentMode === 'imagetopdf'` and calls `handleImageToPdf()`
- `updateVisibleSections()` handles `imagetopdf` case: shows imageSection, hides format/compress groups, sets button text "Convert to PDF"

**Visibility & UI Polish:**
- `updateVisibleSections()` extended to hide `imageSection` by default, show it when `imagetopdf` mode active
- Loading overlay works seamlessly with form disabling during all async operations
- Nav tab icons use Feather-style line icons (document for Convert, settings gear for Tools)
- All modes properly toggle visibility of sections and options based on context

**Key files modified:** `web/frontend/index.html`, `web/frontend/styles.css`, `web/frontend/app.js`, `web/frontend/favicon.svg` (NEW)

**Key design choices:**
- Two-level nav uses CSS border-bottom for active state (cleaner than background highlighting)
- Image-to-PDF reuses merge file list CSS for UI consistency
- Loading overlay is purely CSS-driven (no spinner DOM elements), relies on form-card positioning
- Filename display logic gracefully degrades if server doesn't send displayFilename
- Gmail body is user-friendly and acknowledges the manual attachment step required for web

