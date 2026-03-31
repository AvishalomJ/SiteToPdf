# Project Context

- **Owner:** AvishalomJ
- **Project:** SiteToPdf — A website crawler that takes a primary URL, traverses all paths under it, and generates a PDF containing all page content (excluding navigation menus and metadata).
- **Stack:** TBD (to be decided based on architecture)
- **Created:** 2026-03-31

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### 2026-03-31 — Initial Architecture

- **Stack:** TypeScript + Playwright + Cheerio + Commander
- **Architecture:** Flat `src/` with 5 modules: `types.ts`, `fetcher.ts`, `extractor.ts`, `pdf-generator.ts`, `pipeline.ts`, `index.ts`
- **Data flow:** URL → fetcher (raw HTML) → extractor (clean HTML) → pdf-generator (PDF)
- **Key decision:** Use Playwright for both fetching (JS rendering) and PDF generation (`page.pdf()`). Cheerio for content extraction (no browser needed for DOM stripping).
- **Module contracts** live in `src/types.ts` — `FetchResult`, `ExtractedContent`, `PdfOptions`, `PageEntry`
- **Ownership:** Simba owns `fetcher.ts`, Rafiki owns `extractor.ts` + `pdf-generator.ts`, Mufasa owns `types.ts` + `pipeline.ts` + `index.ts`
- **Phase 2 prep:** `PageEntry` type already defined for multi-URL crawling. Fetcher will need `crawlSite()`, pipeline will need `runCrawl()`.
- **User preference:** AvishalomJ wants clean content only — no menus, nav, metadata in the PDF.

### 2026-03-31 — Phase 2 Wiring: Multi-URL Crawl

- **`pipeline.ts`** — Added `runCrawl()` and `CrawlPipelineOptions`. Flow: `crawlSite()` → map through `extractContent(html, baseUrl)` → `generateMultiPagePdf()`. Failed pages are skipped and reported at the end.
- **`index.ts`** — Restructured CLI to use Commander subcommands with `{ isDefault: true }` on `fetch`. This avoids parent/child option collision. `site-to-pdf <url>` still works (routes to `fetch`), `site-to-pdf crawl <url>` activates multi-URL mode.
- **CLI pattern:** Don't mix `.argument()` on the root program with `.command()` subcommands in Commander — use `{ isDefault: true }` on a named subcommand instead. Otherwise parent options shadow subcommand options.
- **Key files:** `src/pipeline.ts` (runCrawl), `src/index.ts` (crawl subcommand)
- **Crawl options:** `--depth N`, `--max-pages N`, `--delay Ms`, `--format A4|Letter`, `-o output.pdf`
