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

### Retry and Error Classification Strategy

**Author:** Simba  
**Date:** 2026-03-31  
**Status:** Implemented

#### Context
The fetcher needs to handle transient failures gracefully on the real internet.

#### Decision
- **5xx responses** are treated as transient and retried (up to 3 attempts).
- **4xx responses** are treated as permanent and returned immediately (no retry).
- **Empty pages** are retried (some sites return blank on first load).
- **Timeouts and network errors** are retried with exponential backoff (1s → 2s → 4s).
- Errors are classified into kinds (`network`, `timeout`, `http`, `empty-page`, `unknown`) via `FetchError` so the pipeline can make informed decisions about how to handle them.

#### Rationale
Retrying 4xx would waste time on genuinely missing pages. 5xx and empty pages are commonly transient. Exponential backoff avoids hammering struggling servers.

### Content Detection Strategy

**Author:** Rafiki  
**Date:** 2026-03-31  
**Status:** Implemented

#### Context
Real-world websites don't reliably use `<main>` or `<article>` tags. A single CSS selector isn't enough.

#### Decision
The extractor uses a **3-strategy cascade**:

1. **Known selectors** — Try `main`, `[role="main"]`, `article`, `#content`, `.entry-content`, etc. in priority order. Pick the match with the most text content (handles pages with multiple `<article>` elements).
2. **Scoring heuristic** — If no known selector matches with 100+ chars, score all `div`/`section` elements using: text length, paragraph count, heading count, link-density penalty, and class/id keyword bonuses. Highest score wins.
3. **Fallback** — Use `<body>` if nothing scores above threshold.

#### Implications
- The scoring approach handles most real-world sites but may misfire on single-page apps where content is deeply nested in anonymous divs. Phase 2 crawling (with Playwright-rendered HTML) should mitigate this.
- The `baseUrl` parameter for `extractContent()` is optional and backward-compatible. Pipeline should pass `fetchResult.url` when available for best results with relative URLs.

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
