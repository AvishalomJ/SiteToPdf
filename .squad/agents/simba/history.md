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
