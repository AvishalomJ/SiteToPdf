/**
 * Shared type contracts for SiteToPdf.
 *
 * These interfaces define the boundaries between modules:
 *   Fetcher (Simba) → Extractor (Rafiki) → PdfGenerator (Rafiki)
 */

// ── Fetcher output ──────────────────────────────────────────────

/** Result of fetching a single URL. */
export interface FetchResult {
  /** The URL that was fetched. */
  url: string;
  /** Raw HTML content of the page. */
  html: string;
  /** Page title extracted from <title> tag, if available. */
  title: string;
  /** HTTP status code returned by the server. */
  statusCode: number;
}

// ── Extractor output ────────────────────────────────────────────

/** Result of extracting main content from a page's HTML. */
export interface ExtractedContent {
  /** Page title (cleaned). */
  title: string;
  /** Main content as clean HTML (nav, menus, headers, footers stripped). */
  contentHtml: string;
  /** Plain-text version of the content (fallback). */
  textContent: string;
  /** Original (pre-translation) title, if content was translated. */
  originalTitle?: string;
}

// ── PDF generator options ───────────────────────────────────────

export interface PdfOptions {
  /** File path for the output PDF. */
  outputPath: string;
  /** Optional title for the PDF document metadata. */
  title?: string;
  /** Page format (default: 'A4'). */
  format?: 'A4' | 'Letter';
  /** Enable compressed layout to fit more content per page. */
  compress?: boolean;
  /** Target language code if content was translated (e.g., 'he' for Hebrew). */
  translate?: string;
}

// ── Pipeline types (for future multi-URL crawling) ──────────────

/** A single page ready for PDF inclusion. */
export interface PageEntry {
  url: string;
  content: ExtractedContent;
}
