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

