# SiteToPdf

Convert web pages to clean PDFs — with a web app, Electron desktop app, and CLI.

## Features

- **Single URL → PDF** — fetch any web page, extract clean content, generate a styled PDF
- **Crawl Site** — recursively crawl pages under a domain and combine into one PDF
- **URL List** — convert multiple URLs at once into a single multi-page PDF
- **Merge PDFs** — upload multiple PDFs and merge them (with group support — merge subsets independently)
- **Image → PDF** — convert PNG/JPEG images to PDF
- **Summarize** — AI-powered page summarization via Gemini
- **Font Size Control** — choose Small / Normal / Large for PDF text
- **Gmail & WhatsApp Sharing** — share generated PDFs via email or WhatsApp
- **Silent Auto-Update** — Electron app updates in the background (no installer wizard)

## Quick Start

### Web App

```bash
npm install
npx playwright install chromium
npm run build
cd web/server && npm install && npx tsc --project tsconfig.json
npm start
# → http://localhost:3000 (also available on your local network)
```

### CLI

```bash
npm run build
node dist/index.js https://example.com
```

### Electron Desktop App

```bash
npm install
npm run build
npx electron .
```

## Usage (CLI)

```bash
# Basic — generates a PDF named after the page title
site-to-pdf https://example.com

# Custom output path
site-to-pdf https://example.com -o my-doc.pdf

# Letter format instead of A4
site-to-pdf https://example.com --format Letter
```

## Web API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/convert/single` | Convert single URL to PDF |
| POST | `/api/convert/crawl` | Crawl site and generate combined PDF |
| POST | `/api/convert/list` | Convert URL list to multi-page PDF |
| POST | `/api/merge` | Merge PDFs (supports groups) |
| POST | `/api/convert/images-to-pdf` | Convert images to PDF |
| POST | `/api/summarize` | AI summarization |
| GET | `/api/jobs/:id/status` | SSE progress stream |
| GET | `/api/jobs/:id/download` | Download output file |

## Development

```bash
# Build TypeScript (src/)
npm run build

# Build server
cd web/server && npx tsc --project tsconfig.json

# Run tests (71 Playwright UI tests)
npx playwright test

# Start web server
cd web/server && npm start
```

## Architecture

```
src/                    — Core library (shared by CLI, web, Electron)
  pipeline.ts           — Orchestrates fetch → extract → PDF
  fetcher.ts            — URL fetching via Playwright
  extractor.ts          — Content extraction via Cheerio
  pdf-generator.ts      — PDF rendering via Playwright
  types.ts              — Shared interfaces

web/
  server/               — Fastify API server
    routes/             — convert, merge, images, jobs, summarize
    services/           — job-manager (in-memory job queue + SSE)
  frontend/             — Static web app (HTML/CSS/JS)

electron/
  main.js               — Electron main process + auto-updater
  renderer/             — Electron frontend (mirrors web frontend)

tests/ui/               — Playwright test suites
```

## Network Access

The web server binds to `0.0.0.0:3000` by default, making it accessible from any device on your local network. Find your IP with `ipconfig` and visit `http://<your-ip>:3000`.
