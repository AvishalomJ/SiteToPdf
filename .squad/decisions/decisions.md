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
