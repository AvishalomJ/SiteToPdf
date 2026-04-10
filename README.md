# SiteToPdf

CLI tool that fetches a web page, extracts its main content (stripping navigation, menus, and metadata), and generates a clean PDF.

## Quick Start

```bash
npm install
npx playwright install chromium
npm run build
node dist/index.js https://example.com
```

## Usage

```bash
# Basic — generates a PDF named after the page title
site-to-pdf https://example.com

# Custom output path
site-to-pdf https://example.com -o my-doc.pdf

# Letter format instead of A4
site-to-pdf https://example.com --format Letter
```

## Development

```bash
# Run directly with ts-node (no build step)
npm run dev -- https://example.com

# Build to dist/
npm run build
```

## Architecture

```
src/
  index.ts          — CLI entry point (Commander)
  pipeline.ts       — Orchestrates fetch → extract → PDF
  fetcher.ts        — URL fetching via Playwright (Simba)
  extractor.ts      — Content extraction via Cheerio (Rafiki)
  pdf-generator.ts  — PDF rendering via Playwright (Rafiki)
  types.ts          — Shared interfaces / contracts
```

**Data flow:** `URL → fetcher (HTML) → extractor (clean HTML) → pdf-generator (PDF file)`

### Module Contracts

- **Fetcher** returns `FetchResult { url, html, title, statusCode }`
- **Extractor** takes HTML string, returns `ExtractedContent { title, contentHtml, textContent }`
- **PDF Generator** takes `ExtractedContent` + `PdfOptions`, writes a PDF file

## Roadmap

- [ ] Phase 1: Single URL → PDF (current)
- [ ] Phase 2: Crawl all URLs under a root domain → combined PDF
