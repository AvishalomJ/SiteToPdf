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

### Translation Feature Architecture

**Author:** Simba  
**Date:** 2026-03-31  
**Status:** Implemented

#### Context

AvishalomJ requested Hebrew translation support. The feature needs to translate page content before PDF generation, using a free translation API with no key required.

#### Decision

- **Translation library:** `google-translate-api-x` — free, no API key, uses Google Translate under the hood.
- **Module boundary:** New `src/translator.ts` module owns all translation logic. Pipeline calls it between extraction and PDF generation.
- **Original title preserved:** `ExtractedContent.originalTitle` field stores the pre-translation title so the PDF generator (Rafiki) can use it for reference annotations.
- **HTML handling:** HTML is translated with tags preserved via the API's `autoCorrect` mode. Large HTML is chunked at block-element boundaries (≤4000 chars) to avoid API limits.
- **Error resilience:** Translation failure returns original content with a warning — never blocks PDF generation.
- **CLI surface:** `--translate <lang>` on both `fetch` and `crawl` commands. Language code appended to auto-generated filenames (e.g., `-he`).
- **PdfOptions.translate:** Passes the target language code through to the PDF generator so Rafiki can apply RTL styling when `translate === 'he'` (or other RTL languages).

#### Implications

- Rafiki's `pdf-generator.ts` can read `PdfOptions.translate` and `ExtractedContent.originalTitle` to handle RTL layout and title annotations independently.
- Translation adds latency (one API call per content field per page). Crawl mode translates pages sequentially to avoid rate limiting.
- The `google-translate-api-x` package is free but unofficial — may break if Google changes their API. Error handling ensures graceful degradation.

### RTL Layout Support in PDF Generator

**Author:** Rafiki (Content Dev)  
**Date:** 2026-03-31
**Status:** Implemented

#### Context

The `--translate he` feature requires Hebrew-friendly PDF output. Hebrew is a right-to-left language, so the entire page layout — text alignment, list indentation, blockquote borders — must flip direction. At the same time, code blocks and URLs must remain LTR (code is universal, URLs are always left-to-right).

#### Decision

RTL is implemented as a **CSS overlay** pattern rather than a separate complete stylesheet:

1. `buildRtlStyles(compress)` generates additional CSS rules that override directional properties from the base styles (`PDF_STYLES` or `COMPRESSED_STYLES`).
2. The overlay is concatenated after the base styles, relying on CSS cascade for specificity.
3. RTL detection uses `isRtlLanguage()` which supports `he`, `ar`, `fa`, `ur` — extensible for future languages.
4. The `<html>` element gets `lang` and `dir="rtl"` attributes for proper browser rendering.
5. Bilingual titles (translated + original) are shown when `originalTitle` is present on `ExtractedContent`.

#### Rationale

- **Overlay vs. duplicate:** Duplicating 300+ lines of base CSS for an RTL variant would be a maintenance burden. Any style fix would need to be applied twice. The overlay approach keeps RTL as a ~60-line additive layer.
- **Font stack:** `'Segoe UI', 'Arial Hebrew', 'Noto Sans Hebrew', Arial, sans-serif` — these are bundled with Chromium (which Playwright uses), so no external font installation is needed.
- **Code stays LTR:** Using `unicode-bidi: bidi-override` on `pre`/`code` forces LTR rendering regardless of document direction. URLs use `unicode-bidi: embed` which is less aggressive but sufficient for inline content.
- **Line-height adjustment:** Hebrew characters benefit from slightly more vertical space. Normal mode gets 1.8 (vs 1.7 base), compressed mode gets 1.45 (vs 1.35 base) — proportional increase in both cases.

#### Implications

- Adding new RTL languages only requires updating the `isRtlLanguage()` array.
- If a future language needs a different font stack (e.g., Arabic-specific), `buildRtlStyles` could accept the language code and branch on it. Current implementation uses a shared Semitic/Hebrew font stack.
- The `originalTitle` field on `ExtractedContent` is set by the translation pipeline (Simba's domain). Rafiki's code only reads it.

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
