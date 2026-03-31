# Squad Decisions

## Active Decisions

### Tech Stack & Architecture

**Author:** Mufasa (Lead)  
**Date:** 2026-03-31  
**Status:** Active

#### Tech Stack

- **Language:** TypeScript (Node.js)
- **CLI framework:** Commander
- **URL fetching:** Playwright (handles JS-rendered pages)
- **Content extraction:** Cheerio (lightweight DOM manipulation)
- **PDF generation:** Playwright `page.pdf()` (Chromium-based rendering)

#### Why This Stack

1. **Playwright** handles JavaScript-heavy sites out of the box — no separate headless browser config
2. **Cheerio** is fast and lightweight for stripping nav/menus without spinning up a browser
3. **TypeScript** gives us typed interfaces between modules so Simba and Rafiki can work in parallel with clear contracts
4. Playwright's built-in `page.pdf()` produces high-fidelity PDFs without a separate PDF library

#### Architecture

`
src/
  index.ts          — CLI entry point (Commander)
  pipeline.ts       — Orchestrates fetch → extract → PDF
  fetcher.ts        — URL fetching via Playwright (Simba owns)
  extractor.ts      — Content extraction via Cheerio (Rafiki owns)
  pdf-generator.ts  — PDF rendering via Playwright (Rafiki owns)
  types.ts          — Shared interfaces / contracts (Mufasa owns)
`

**Data flow:** `URL → fetcher (raw HTML) → extractor (clean HTML) → pdf-generator (PDF file)`

#### Module Contracts (in `src/types.ts`)

- **FetchResult:** `{ url, html, title, statusCode }`
- **ExtractedContent:** `{ title, contentHtml, textContent }`
- **PdfOptions:** `{ outputPath, title?, format? }`

#### Ownership

| Module | Owner | Key file |
|--------|-------|----------|
| Types / contracts | Mufasa | `src/types.ts` |
| Pipeline wiring | Mufasa | `src/pipeline.ts` |
| URL fetcher | Simba | `src/fetcher.ts` |
| Content extractor | Rafiki | `src/extractor.ts` |
| PDF generator | Rafiki | `src/pdf-generator.ts` |
| CLI entry point | Mufasa | `src/index.ts` |

#### Phase 2 Notes

When we add multi-URL crawling:
- `fetcher.ts` gets a `crawlSite(rootUrl)` function that returns `FetchResult[]`
- `pipeline.ts` gets a `runCrawl()` that iterates pages and combines into one PDF
- The `PageEntry` type in `types.ts` is already defined for this
- Simba will need to handle cycle detection, URL normalization, and depth limits

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
