# Decisions

## CLI Structure for Crawl Command

**Author:** Mufasa (Lead)  
**Date:** 2026-03-31  
**Status:** Implemented

### Decision

The CLI uses Commander subcommands:
- `site-to-pdf <url>` — single-URL mode (default, routes to `fetch` subcommand via `{ isDefault: true }`)
- `site-to-pdf crawl <url>` — multi-URL crawl mode

Options for crawl: `--depth N`, `--max-pages N`, `--delay Ms`, `--format A4|Letter`, `-o output.pdf`

### Rationale

Using `{ isDefault: true }` on the `fetch` subcommand avoids the Commander pitfall where parent-level `.argument()` and `.option()` definitions shadow subcommand options. This keeps backward compatibility (`site-to-pdf <url>` still works) while giving each subcommand isolated option scoping.

### Pipeline Contract

`runCrawl(CrawlPipelineOptions)` in `pipeline.ts` is the orchestration entry point. It:
1. Calls `crawlSite()` (Simba's fetcher) to BFS-crawl the site
2. Maps each `FetchResult` through `extractContent()` (Rafiki's extractor), passing `baseUrl` for relative URL resolution
3. Calls `generateMultiPagePdf()` (Rafiki's PDF generator) with the resulting `PageEntry[]`
4. Skips failed pages gracefully, reports errors at the end
