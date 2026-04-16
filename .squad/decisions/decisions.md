# Decisions

## Auto-Updater & Default Output Directory

**Author:** Simba (Backend Dev)  
**Date:** 2026-04-10  
**Status:** Implemented

### Context

AvishalomJ requested two features: (1) auto-update via GitHub Releases so installed apps self-update, and (2) a default PDF output folder at `Documents/SiteToPdf` so users don't litter PDFs in random directories.

### Decisions

#### Auto-Updater

- **Library:** `electron-updater` (v6.x) — installed as a **production dependency** (not devDependency) because it runs inside the packaged app.
- **Update flow:** Check for updates silently on app start → auto-download in background → show notification bar → user clicks "Restart & Update" → `quitAndInstall()`.
- **Error handling:** All update errors are silently logged. No modal dialogs, no blocking the user. Offline/no-releases/rate-limited scenarios all degrade gracefully.
- **Publish target:** GitHub Releases via `"publish": [{"provider": "github", "owner": "AvishalomJ", "repo": "SiteToPdf"}]` in electron-builder config.

#### Default Output Directory

- **Location:** `{userDocumentsDir}/SiteToPdf` — uses `app.getPath('documents')` for cross-platform correctness.
- **CWD approach:** When no output path is specified, `withDefaultOutputDir()` temporarily changes `process.cwd()` to the default dir before calling the pipeline. CWD is restored in a `finally` block. This is safe because conversions are serialized (only one at a time).
- **Backward compatible:** If user specifies a custom output path, it's used as-is. Default only applies when the field is empty.

### Implications

- `npm run dist` must be run to produce GitHub Release-compatible artifacts. The `publish` config tells electron-builder where to upload.
- Version bumps in `package.json` drive the update check — `electron-updater` compares `app.getVersion()` against the latest GitHub Release tag.
- The CWD approach avoids duplicating pipeline filename generation logic. If the pipeline ever becomes concurrent (multiple conversions), this would need refactoring to use explicit output paths instead.

---

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

---

## PDF Merge Feature Architecture

**Author:** Simba (Backend Dev)  
**Date:** 2026-04-16  
**Status:** Implemented (v0.5.0)

### Context

AvishalomJ requested a PDF merge feature — users need to combine multiple existing PDF files into one without re-crawling or re-converting.

### Decision

- **Library:** `pdf-lib` (pure JavaScript, no native binaries, works in Node.js main process). Chosen over alternatives (pdf-merger-js, hummus) for zero-dependency simplicity.
- **Architecture:** Merge runs entirely in the main process — no Playwright, no browser. This makes it fast and lightweight.
- **UI pattern:** 5th mode button in existing mode selector. Merge section shows file list with reorder/remove controls. Format and compress options hidden (irrelevant for merge).
- **Output naming:** `merged-YYYY-MM-DD-HHmmss.pdf` auto-generated in `Documents/SiteToPdf/`. Custom output path supported via existing browse control.
- **Validation:** Minimum 2 files required. Dedup on add.

### Rationale

- pdf-lib is a pure JS library that reads/writes PDFs without Playwright or any external process, so merging is near-instant.
- Reuses existing IPC patterns (`ipcMain.handle` + `isConverting` guard) and progress/complete/error event channels.
- File list UI with reorder controls gives users full control over page order without drag-and-drop complexity.

### Implications

- `pdf-lib` is now a production dependency — keep it updated.
- If future features need PDF manipulation (page extraction, rotation), pdf-lib already supports those operations.
- The `formatGroup`/`compressGroup` elements now have IDs for per-mode visibility — other modes could use this pattern too.

---

## Architecture Decision: Aspire Web Deployment

**Author:** Mufasa (Lead)  
**Date:** 2026-04-12  
**Status:** Proposed — awaiting AvishalomJ approval  
**Scope:** Additive web deployment alongside existing Electron desktop app

### 1. Executive Summary

SiteToPdf gains a browser-accessible version orchestrated by .NET Aspire. The existing Electron desktop app is **unchanged**. The core TypeScript pipeline (`src/`) already has **zero Electron dependencies** — it runs in any Node.js process today. We wrap it in a lightweight HTTP/WebSocket API server, containerize it, and let Aspire manage orchestration, health checks, and telemetry.

**Recommended stack:** Node.js API server (Fastify) + vanilla web frontend + .NET Aspire AppHost.

### 2. Codebase Analysis — What's Reusable vs. Electron-Specific

#### ✅ Fully Reusable (no changes needed)

| Module | File | Why |
|--------|------|-----|
| Type contracts | `src/types.ts` | Pure TS interfaces — `FetchResult`, `ExtractedContent`, `PdfOptions`, `PageEntry` |
| URL Fetcher | `src/fetcher.ts` | Playwright only — `fetchUrl()`, `crawlSite()`, `closeBrowser()` |
| Content Extractor | `src/extractor.ts` | Cheerio only — `extractContent()` |
| PDF Generator | `src/pdf-generator.ts` | Playwright `page.pdf()` — `generatePdf()`, `generateMultiPagePdf()` |
| Pipeline Orchestrator | `src/pipeline.ts` | Wires fetch → extract → PDF — `runSingleUrl()`, `runCrawl()`, `runList()`, `shutdown()` |
| Translator | `src/translator.ts` | Ollama HTTP calls — no Electron dependency |
| CLI | `src/index.ts` | Commander-based — already works standalone |

#### ❌ Electron-Specific (NOT reusable — needs web equivalents)

| Component | File | Electron Coupling |
|-----------|------|-------------------|
| Main process | `electron/main.js` | `BrowserWindow`, `ipcMain`, `dialog`, `shell`, `app.getPath()`, `autoUpdater`, `Menu` |
| Preload bridge | `electron/preload.js` | `contextBridge.exposeInMainWorld('siteToPdf', ...)` |
| Frontend JS | `electron/renderer/app.js` | Every action calls `window.siteToPdf.*` (IPC bridge) |
| Gemini API calls | `electron/main.js` lines 440-640 | Logic is portable but embedded in Electron main process |
| Settings/API key | `electron/main.js` lines 394-438 | `app.getPath('userData')` for file-based storage |
| File save | `electron/main.js` lines 176-184 | `app.getPath('documents')` + `process.chdir()` |

#### 🔄 Needs Extraction (portable logic trapped in Electron code)

1. **Gemini summarization** (`callGeminiApi`, `callGeminiWithRetry`, `summaryToHtml`) — pure HTTPS + string processing, should become a shared module.
2. **Output filename generation** — already in `pipeline.ts`, but the "default output directory" logic is in `electron/main.js`.

### 3. Recommended Architecture

#### 3.1 Why Node.js Backend (not .NET/C#)

| Option | Pros | Cons |
|--------|------|------|
| **A) Node.js API (Fastify) ✅** | Reuses pipeline directly (`import { runSingleUrl } from './pipeline'`); single language; team knows TypeScript | Aspire integration via container (not native project) |
| B) .NET API calling Node.js | Native Aspire integration; C# ecosystem | Two languages; must shell out or use child_process for pipeline; serialization overhead; no team C# experience |
| C) .NET API re-implementing pipeline | Full Aspire integration | Complete rewrite of fetcher/extractor/PDF logic in C#; Playwright for .NET exists but different API; massive scope |

**Decision: Option A.** The entire value of SiteToPdf is the TypeScript pipeline. Rewriting it in C# has zero upside and months of risk. Aspire supports non-.NET services as container resources via `AddContainer()` or `AddDockerfile()` — this is the designed path for polyglot systems.

#### 3.2 System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  .NET Aspire AppHost                     │
│  (Orchestration, Service Discovery, Health, Telemetry)  │
├──────────────────────┬──────────────────────────────────┤
│                      │                                  │
│  ┌───────────────────▼────────────────────────┐         │
│  │         SiteToPdf API Server               │         │
│  │     (Node.js / Fastify / TypeScript)       │         │
│  │                                            │         │
│  │  Routes:                                   │         │
│  │    POST /api/convert/single                │         │
│  │    POST /api/convert/crawl                 │         │
│  │    POST /api/convert/list                  │         │
│  │    POST /api/summarize                     │         │
│  │    GET  /api/jobs/:id/status  (SSE/WS)     │         │
│  │    GET  /api/jobs/:id/download             │         │
│  │    GET  /health                            │         │
│  │                                            │         │
│  │  Serves: Static web frontend               │         │
│  │  Uses:   src/ pipeline (unchanged)         │         │
│  └────────────────────────────────────────────┘         │
│                                                         │
│  ┌────────────────────────────────────────────┐         │
│  │         Aspire Dashboard                   │         │
│  │   (Auto-provided: logs, traces, metrics)   │         │
│  └────────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────┘
```

#### 3.3 API Design

The API replaces the Electron IPC layer. Each `window.siteToPdf.*` call maps to an HTTP endpoint:

| Electron IPC | Web API | Notes |
|-------------|---------|-------|
| `convert:single` | `POST /api/convert/single` | Returns job ID |
| `convert:crawl` | `POST /api/convert/crawl` | Returns job ID |
| `convert:list` | `POST /api/convert/list` | Returns job ID |
| `summarize:content` | `POST /api/summarize` | Returns job ID |
| Progress events via IPC `on('progress')` | `GET /api/jobs/:id/status` (Server-Sent Events) | Real-time progress streaming |
| `dialog:save` / `dialog:open-file` | `GET /api/jobs/:id/download` | Returns PDF as download stream |
| `settings:get-api-key` / `settings:set-api-key` | `POST /api/settings/api-key` | Per-session or server-level (see §4.3) |

**Job-based pattern:** Conversions are long-running (10s–5min). The API returns a job ID immediately, the client polls or streams status via SSE, and downloads the PDF when done.

#### 3.4 Frontend Approach

**Reuse the existing HTML/CSS, replace the JS glue.**

The current frontend (`electron/renderer/`) is vanilla HTML/CSS/JS with no framework. The HTML structure and CSS styling are fully reusable. Only `app.js` needs to be adapted:

- Replace `window.siteToPdf.convertSingle(...)` → `fetch('/api/convert/single', ...)`
- Replace `window.siteToPdf.onProgress(cb)` → `EventSource('/api/jobs/:id/status')`
- Replace `window.siteToPdf.openFile(path)` → download link / `window.open(downloadUrl)`
- Remove: `chooseSavePath` (no local dialogs in browser), `openFolder`, `installUpdate`
- Add: download button that triggers browser save-as

The web frontend lives in a separate directory (`web/frontend/`) so it doesn't conflict with the Electron renderer.

### 4. Key Design Decisions

#### 4.1 File Handling — Temporary Storage + Download Streaming

Desktop: saves PDFs to `Documents/SiteToPdf/` permanently.  
Web: PDFs are **ephemeral**. Generated into a temp directory, streamed to the client on download, then cleaned up.

```
Jobs lifecycle:
  1. Client POSTs conversion request → server returns { jobId }
  2. Server runs pipeline, writes PDF to temp dir: /jobs/{jobId}/output.pdf
  3. Client downloads via GET /api/jobs/{jobId}/download
  4. Server cleans up after download (or after TTL expiry, e.g., 1 hour)
```

A simple in-memory job store (Map) is sufficient initially. No database needed — jobs are short-lived.

#### 4.2 Playwright in Server Context — Resource Management

Playwright spawns headless Chromium instances. On a server handling multiple concurrent requests, this needs guardrails:

- **Browser pool:** Max N concurrent browser instances (configurable, default 3). Queue requests beyond the limit.
- **Per-job timeout:** Hard 5-minute timeout per conversion. Kills the browser context on timeout.
- **Memory limit:** Each Chromium instance uses ~100-300MB. Set container memory limit in Aspire accordingly.
- **Playwright install:** The Dockerfile must run `npx playwright install chromium --with-deps` to install browser binaries and OS dependencies.

#### 4.3 Gemini API Key Management

Desktop: per-user key stored in `%APPDATA%/SiteToPdf/settings.json`.  
Web: Two options (recommend **Option A** to start):

| Option | Description | When to use |
|--------|-------------|-------------|
| **A) User-provided per-request** ✅ | User enters their API key in the web UI settings; it's stored in `localStorage` and sent with each summarize request in the `Authorization` header | Simplest; matches desktop behavior; no server-side secret storage needed |
| B) Server-level key via Aspire secrets | Aspire injects the key as an environment variable into the container; all users share it | Multi-tenant SaaS; requires Aspire secret management |

**Decision:** Start with Option A (per-request). The web UI stores the key in `localStorage` (never sent to our server except in the summarize request). This matches AvishalomJ's security policy: key stays local, never committed to source control.

#### 4.4 Translator Module — Ollama Dependency

The current translator uses Ollama (local LLM). In a web/server context:
- Ollama would need to run as a **sidecar container** managed by Aspire
- Or: switch to the Gemini API for translation too (already available, eliminates Ollama dependency for the web version)
- **Recommendation:** For the web deployment, use Gemini for translation (already integrated for summarization). Keep Ollama support for desktop/CLI only. This avoids the complexity of running a GPU-heavy LLM container in the initial deployment.

### 5. Project Structure

```
SiteToPdf/
├── src/                          # ✅ Unchanged — shared TypeScript pipeline
│   ├── types.ts
│   ├── fetcher.ts
│   ├── extractor.ts
│   ├── pdf-generator.ts
│   ├── pipeline.ts
│   ├── translator.ts
│   └── index.ts                  # CLI entry point
│
├── electron/                     # ✅ Unchanged — desktop app
│   ├── main.js
│   ├── preload.js
│   └── renderer/
│
├── web/                          # 🆕 Web deployment
│   ├── server/                   # 🆕 Fastify API server
│   │   ├── server.ts             # HTTP server + route registration
│   │   ├── routes/
│   │   │   ├── convert.ts        # POST /api/convert/*
│   │   │   ├── summarize.ts      # POST /api/summarize
│   │   │   ├── jobs.ts           # GET /api/jobs/:id/*
│   │   │   └── health.ts         # GET /health
│   │   ├── services/
│   │   │   ├── job-manager.ts    # Job queue + lifecycle
│   │   │   ├── browser-pool.ts   # Playwright instance pooling
│   │   │   └── gemini.ts         # Extracted from electron/main.js
│   │   ├── Dockerfile            # Node.js + Playwright container
│   │   └── package.json          # Server-specific deps (fastify, etc.)
│   │
│   └── frontend/                 # 🆕 Web frontend (adapted from electron/renderer)
│       ├── index.html            # Copied + adapted from electron/renderer
│       ├── styles.css            # Reused as-is from electron/renderer
│       └── app.js                # Rewritten: fetch() + SSE instead of IPC
│
├── aspire/                       # 🆕 .NET Aspire orchestration
│   ├── SiteToPdf.AppHost/        # AppHost project
│   │   ├── SiteToPdf.AppHost.csproj
│   │   └── Program.cs            # Aspire service wiring
│   └── SiteToPdf.sln             # Solution file
│
├── package.json                  # Existing — shared pipeline deps
├── tsconfig.json                 # Existing
└── README.md                     # Updated with web deployment docs
```

### 6. Aspire AppHost Configuration

```csharp
// aspire/SiteToPdf.AppHost/Program.cs
var builder = DistributedApplication.CreateBuilder(args);

var api = builder.AddDockerfile("sitetopdf-api", "../../web/server")
    .WithHttpEndpoint(port: 3000, targetPort: 3000, name: "api")
    .WithHttpHealthCheck("/health")
    .WithEnvironment("NODE_ENV", "production")
    .WithEnvironment("MAX_CONCURRENT_BROWSERS", "3")
    .WithEnvironment("JOB_TTL_MINUTES", "60");

// The web frontend is served by the API server (static files)
// No separate frontend container needed

builder.Build().Run();
```

**What Aspire provides out of the box:**
- **Dashboard:** Live logs, traces, and metrics for the Node.js service
- **Health checks:** Automatic `/health` endpoint monitoring
- **Service discovery:** Environment-injected connection strings (useful if we add Redis/DB later)
- **OpenTelemetry:** Auto-collection of traces and metrics from the container
- **Lifecycle management:** Start, stop, restart the Node.js container

### 7. Deployment Considerations

#### Container Image

```dockerfile
# web/server/Dockerfile
FROM node:20-slim

# Install Playwright Chromium + OS dependencies
RUN npx playwright install chromium --with-deps

WORKDIR /app

# Copy shared pipeline + web server
COPY package*.json ./
COPY tsconfig.json ./
COPY src/ ./src/
COPY web/server/ ./web/server/

RUN npm ci --production
RUN npx tsc

EXPOSE 3000
CMD ["node", "dist/web/server/server.js"]
```

#### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | HTTP server port |
| `MAX_CONCURRENT_BROWSERS` | 3 | Browser pool size |
| `JOB_TTL_MINUTES` | 60 | How long to keep completed job PDFs |
| `NODE_ENV` | production | Node environment |

#### Resource Requirements

- **Memory:** 1-2 GB minimum (Chromium instances are hungry)
- **CPU:** 2+ cores recommended for concurrent conversions
- **Disk:** Temp storage for PDFs (100MB+ depending on traffic)

### 8. Phase Breakdown

#### Phase 1: API Server + Core Conversion (MVP)
**Goal:** Web users can convert a single URL to PDF and download it.

- [ ] Create `web/server/` with Fastify
- [ ] Implement `POST /api/convert/single` → job-based pipeline
- [ ] Implement `GET /api/jobs/:id/status` (SSE progress)
- [ ] Implement `GET /api/jobs/:id/download` (PDF streaming)
- [ ] Implement `GET /health`
- [ ] Create `Dockerfile` with Playwright
- [ ] Create Aspire AppHost project
- [ ] Adapt web frontend (`web/frontend/`) for single-URL mode

**Estimated effort:** 2-3 sessions

#### Phase 2: Full Feature Parity
**Goal:** Crawl, list, and summarize modes work on web.

- [ ] Add `POST /api/convert/crawl` and `POST /api/convert/list`
- [ ] Extract Gemini logic into `web/server/services/gemini.ts`
- [ ] Add `POST /api/summarize`
- [ ] Browser pool + concurrency limits
- [ ] Web frontend: all mode tabs working

**Estimated effort:** 2 sessions

#### Phase 3: Production Hardening
**Goal:** Ready for real usage.

- [ ] Job cleanup (TTL-based temp file expiration)
- [ ] Rate limiting (per-IP or per-session)
- [ ] Error handling + graceful degradation
- [ ] Aspire health check tuning
- [ ] Logging + OpenTelemetry integration
- [ ] README update with web deployment instructions

**Estimated effort:** 1-2 sessions

### 9. What We're NOT Doing

- **NOT replacing Electron.** Desktop app continues to ship via electron-builder.
- **NOT rewriting the pipeline.** The `src/` directory is touched only if we need to extract a shared utility.
- **NOT adding a database.** In-memory job store is sufficient for single-server deployment.
- **NOT building multi-tenant auth.** This is a tool, not a SaaS. Per-request API key is enough.
- **NOT using Blazor/Razor.** The existing vanilla HTML/CSS/JS is clean and simple. No framework needed.

### 10. Open Questions for AvishalomJ

1. **Hosting target:** Is this for local development use (Aspire `dotnet run`), or cloud deployment (Azure Container Apps / ACA)?
2. **Concurrent users:** How many simultaneous conversions should we plan for? (Affects browser pool size + container resources.)
3. **Translation strategy:** Okay to use Gemini for web translation instead of Ollama? Simpler deployment, but uses API quota.
4. **Domain/URL:** Any preferences for how the web app will be accessed?

---

*This is a planning document. No code has been written. Implementation begins after approval.*
