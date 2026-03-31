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
