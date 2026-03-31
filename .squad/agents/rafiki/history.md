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
