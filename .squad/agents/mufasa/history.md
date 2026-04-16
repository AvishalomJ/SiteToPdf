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

### 2026-04-12 — Aspire Web Deployment Architecture Analysis

- **Key finding:** The entire `src/` pipeline (fetcher, extractor, pdf-generator, pipeline, translator, types) has **zero Electron dependencies**. It imports only Playwright, Cheerio, Commander, and Ollama HTTP. This means it can run in any Node.js server without modification.
- **Electron coupling is thin:** `electron/main.js` is ~640 lines that wire IPC handlers to `dist/pipeline.js` calls + Gemini summarization + settings file I/O + native dialogs. The preload bridge (`window.siteToPdf`) is the sole API surface for the renderer.
- **Gemini summarization** (callGeminiApi, callGeminiWithRetry, summaryToHtml) is embedded in `electron/main.js` but has no Electron imports — it's pure `https.request()`. Should be extracted into a shared module for web reuse.
- **Architecture decision:** Node.js API server (Fastify) + .NET Aspire container orchestration. Chose Node.js backend over C#/.NET backend because the TypeScript pipeline is the core value — rewriting it has zero upside. Aspire supports non-.NET containers via `AddDockerfile()`.
- **Job-based API pattern:** Web conversions are long-running. POST returns a job ID; client streams progress via Server-Sent Events (SSE); downloads PDF when done. Replaces Electron's synchronous IPC `invoke/on` pattern.
- **Playwright server concerns:** Browser pooling (max N concurrent), per-job timeouts, container memory limits (Chromium = 100-300MB per instance).
- **API key strategy for web:** User-provided per-request (stored in `localStorage`, sent in request header). Matches desktop's per-user model. No server-side secret storage initially.
- **Frontend reuse:** HTML/CSS from `electron/renderer/` is reusable as-is. Only `app.js` needs adaptation (fetch API + SSE instead of `window.siteToPdf.*` IPC).
- **Translator on web:** Recommended Gemini for web translation instead of Ollama to avoid GPU/LLM sidecar complexity. Keep Ollama for desktop/CLI.
- **Decision document:** `.squad/decisions/inbox/mufasa-aspire-architecture.md` — awaiting AvishalomJ approval.
