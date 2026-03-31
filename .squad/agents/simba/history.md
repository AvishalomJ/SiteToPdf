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

- **2026-03-31:** Tech stack finalized by Mufasa. Playwright chosen for native JS rendering + built-in PDF support. Cheerio for fast extraction. TypeScript enforces contracts between modules.
