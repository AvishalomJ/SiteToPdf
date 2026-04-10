/**
 * URL Fetcher — owned by Simba.
 *
 * Responsible for loading a URL and returning its raw HTML.
 * Uses Playwright to handle JavaScript-rendered pages.
 *
 * Phase 1: Fetch a single URL with retry logic and error handling.
 * Phase 2: Crawl all links under a root URL via crawlSite().
 */

import { chromium, type Browser, type Page } from 'playwright';
import { FetchResult } from './types';

// ── Constants ───────────────────────────────────────────────────

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRIES = 3;
const BACKOFF_BASE_MS = 1_000;

// ── Crawl options (local types — types.ts stays untouched) ──────

export interface CrawlOptions {
  /** Maximum link depth from root URL (default: 3). */
  maxDepth?: number;
  /** Maximum total pages to fetch (default: 50). */
  maxPages?: number;
  /** Delay in ms between successive requests (default: 500). */
  requestDelayMs?: number;
  /** Navigation timeout per page in ms (default: 30 000). */
  timeoutMs?: number;
  /** Number of retry attempts per URL (default: 3). */
  retries?: number;
}

// ── Custom error classes ────────────────────────────────────────

export class FetchError extends Error {
  constructor(
    message: string,
    public readonly url: string,
    public readonly kind: 'network' | 'timeout' | 'http' | 'empty-page' | 'unknown',
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'FetchError';
  }
}

// ── Browser singleton ───────────────────────────────────────────

let _browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!_browser) {
    _browser = await chromium.launch({ headless: true });
  }
  return _browser;
}

// ── Helpers ─────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Classify a thrown error into a FetchError kind. */
function classifyError(err: unknown, url: string): FetchError {
  const msg = err instanceof Error ? err.message : String(err);

  if (/timeout/i.test(msg) || /exceeded/i.test(msg)) {
    return new FetchError(`Timeout while loading ${url}: ${msg}`, url, 'timeout');
  }
  if (/net::|ECONNREFUSED|ENOTFOUND|ECONNRESET|ERR_NAME_NOT_RESOLVED/i.test(msg)) {
    return new FetchError(`Network error for ${url}: ${msg}`, url, 'network');
  }
  return new FetchError(`Failed to fetch ${url}: ${msg}`, url, 'unknown');
}

// ── URL normalization ───────────────────────────────────────────

/**
 * Normalize a URL for deduplication:
 * - Strip fragment (#...)
 * - Remove default ports
 * - Lowercase scheme + host
 * - Collapse trailing slashes (keep a single slash for root paths)
 * - Resolve relative URLs against a base when provided
 */
export function normalizeUrl(raw: string, base?: string): string {
  let parsed: URL;
  try {
    parsed = base ? new URL(raw, base) : new URL(raw);
  } catch {
    return raw; // unparseable — return as-is so callers can skip it
  }

  // Strip fragment
  parsed.hash = '';

  // Remove default ports
  if (
    (parsed.protocol === 'http:' && parsed.port === '80') ||
    (parsed.protocol === 'https:' && parsed.port === '443')
  ) {
    parsed.port = '';
  }

  let href = parsed.href;

  // Collapse trailing slash unless it IS the path root
  if (parsed.pathname !== '/' && href.endsWith('/')) {
    href = href.slice(0, -1);
  }

  return href;
}

// ── Link discovery ──────────────────────────────────────────────

/**
 * Extract all same-origin <a href> links from the current page.
 * Returns normalized, deduplicated absolute URLs.
 */
export async function discoverLinks(page: Page, baseUrl: string): Promise<string[]> {
  const origin = new URL(baseUrl).origin;

  const rawHrefs: string[] = await page.$$eval('a[href]', (anchors) =>
    anchors.map((a) => a.getAttribute('href') ?? '').filter(Boolean),
  );

  const seen = new Set<string>();
  const results: string[] = [];

  for (const href of rawHrefs) {
    const normalized = normalizeUrl(href, baseUrl);

    // Only keep same-origin, http(s) links we haven't seen
    let parsed: URL;
    try {
      parsed = new URL(normalized);
    } catch {
      continue;
    }

    if (parsed.origin !== origin) continue;
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
    if (seen.has(normalized)) continue;

    seen.add(normalized);
    results.push(normalized);
  }

  return results;
}

// ── Single-URL fetch (hardened) ─────────────────────────────────

/**
 * Fetch a single URL and return its rendered HTML.
 * Retries transient failures with exponential backoff.
 */
export async function fetchUrl(
  url: string,
  options?: { timeoutMs?: number; retries?: number },
): Promise<FetchResult> {
  const timeout = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxAttempts = options?.retries ?? DEFAULT_RETRIES;

  const browser = await getBrowser();

  let lastError: FetchError | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page = await context.newPage();

    try {
      const response = await page.goto(url, { waitUntil: 'networkidle', timeout });

      const statusCode = response?.status() ?? 0;

      // Treat 5xx as transient — retry; 4xx is permanent — fail fast
      if (statusCode >= 500) {
        lastError = new FetchError(
          `HTTP ${statusCode} from ${url}`,
          url,
          'http',
          statusCode,
        );
        // fall through to retry logic below
      } else {
        const html = await page.content();
        const title = await page.title();

        if (!html || html === '<html><head></head><body></body></html>') {
          lastError = new FetchError(`Empty page returned by ${url}`, url, 'empty-page', statusCode);
          // fall through to retry
        } else {
          return { url, html, title, statusCode };
        }
      }
    } catch (err) {
      lastError = classifyError(err, url);
    } finally {
      await context.close();
    }

    // Exponential backoff before next attempt
    if (attempt < maxAttempts) {
      const delay = BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
      await sleep(delay);
    }
  }

  throw lastError ?? new FetchError(`All ${maxAttempts} attempts failed for ${url}`, url, 'unknown');
}

// ── Multi-URL crawl ─────────────────────────────────────────────

/**
 * Crawl a site starting from rootUrl, following same-origin links
 * breadth-first up to the configured depth and page limits.
 */
export async function crawlSite(
  rootUrl: string,
  options?: CrawlOptions,
): Promise<FetchResult[]> {
  const maxDepth = options?.maxDepth ?? 3;
  const maxPages = options?.maxPages ?? 50;
  const requestDelay = options?.requestDelayMs ?? 500;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options?.retries ?? DEFAULT_RETRIES;

  const normalizedRoot = normalizeUrl(rootUrl);

  // Downstream-only filtering: only crawl URLs whose path starts with the root URL's path
  const rootParsed = new URL(normalizedRoot);
  const basePath = rootParsed.pathname.endsWith('/')
    ? rootParsed.pathname
    : rootParsed.pathname + '/';

  // BFS state
  const visited = new Set<string>();
  const results: FetchResult[] = [];

  // Queue entries: [url, depth]
  const queue: Array<[string, number]> = [[normalizedRoot, 0]];
  visited.add(normalizedRoot);

  const browser = await getBrowser();

  while (queue.length > 0 && results.length < maxPages) {
    const [currentUrl, depth] = queue.shift()!;

    // Fetch the page
    let result: FetchResult;
    try {
      result = await fetchUrl(currentUrl, { timeoutMs, retries });
    } catch (err) {
      console.warn(`[crawl] Skipping ${currentUrl}: ${(err as Error).message}`);
      continue;
    }

    results.push(result);

    // Discover links if we haven't hit max depth
    if (depth < maxDepth && results.length < maxPages) {
      const context = await browser.newContext({ userAgent: USER_AGENT });
      const page = await context.newPage();

      try {
        await page.goto(currentUrl, { waitUntil: 'networkidle', timeout: timeoutMs });
        const links = await discoverLinks(page, currentUrl);

        for (const link of links) {
          if (visited.has(link) || results.length + queue.length >= maxPages) continue;

          // Only follow links whose path is downstream of the root URL
          try {
            const linkParsed = new URL(link);
            if (!linkParsed.pathname.startsWith(basePath) && linkParsed.pathname + '/' !== basePath) continue;
          } catch { continue; }

          visited.add(link);
          queue.push([link, depth + 1]);
        }
      } catch {
        // Link discovery failed — we still have the fetched content, move on
      } finally {
        await context.close();
      }
    }

    // Rate-limit: pause between requests
    if (queue.length > 0) {
      await sleep(requestDelay);
    }
  }

  return results;
}

// ── Cleanup ─────────────────────────────────────────────────────

/**
 * Shut down the shared browser instance. Call once when the pipeline is done.
 */
export async function closeBrowser(): Promise<void> {
  if (_browser) {
    await _browser.close();
    _browser = null;
  }
}
