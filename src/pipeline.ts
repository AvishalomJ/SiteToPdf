/**
 * Pipeline — orchestrates fetch → extract → PDF.
 *
 * This is the glue that Mufasa owns. It wires Simba's fetcher
 * to Rafiki's extractor and PDF generator.
 */

import { fetchUrl, crawlSite, closeBrowser, type CrawlOptions } from './fetcher';
import { extractContent } from './extractor';
import { generatePdf, generateMultiPagePdf, closePdfBrowser } from './pdf-generator';
import { translateContent } from './translator';
import { PdfOptions, PageEntry } from './types';

export interface PipelineOptions {
  url: string;
  output?: string;
  format?: 'A4' | 'Letter';
  compress?: boolean;
  translate?: string;
  fontSize?: 'small' | 'normal' | 'large';
}

/**
 * Run the single-URL pipeline: fetch → extract → PDF.
 */
export async function runSingleUrl(options: PipelineOptions): Promise<string> {
  const { url, format } = options;
  const progressTimer = startProgressTimer();

  try {
    console.log(`Fetching: ${url}`);
    const fetchResult = await fetchUrl(url);

    if (fetchResult.statusCode >= 400) {
      throw new Error(`Failed to fetch ${url} — HTTP ${fetchResult.statusCode}`);
    }

    console.log(`Extracting content from: ${fetchResult.title || url}`);
    let content = extractContent(fetchResult.html);

    if (!content.textContent) {
      throw new Error(`No content extracted from ${url}`);
    }

    if (options.translate) {
      content = await translateContent(content, options.translate);
    }

    const outputPath = options.output ?? generateOutputFilename(url, options.compress, options.translate);

    const pdfOptions: PdfOptions = {
      outputPath,
      title: content.title,
      format: format ?? 'A4',
      compress: options.compress,
      translate: options.translate,
      fontSize: options.fontSize,
    };

    console.log(`Generating PDF: ${outputPath}`);
    const result = await generatePdf(content, pdfOptions);

    console.log(`Done — ${result}`);
    return result;
  } finally {
    clearTimeout(progressTimer);
  }
}

// ── Multi-URL crawl pipeline ─────────────────────────────────────

export interface CrawlPipelineOptions {
  url: string;
  output?: string;
  format?: 'A4' | 'Letter';
  depth?: number;
  maxPages?: number;
  delay?: number;
  compress?: boolean;
  translate?: string;
  fontSize?: 'small' | 'normal' | 'large';
}

/**
 * Run the multi-URL crawl pipeline: crawl → extract each page → combine into one PDF.
 * Skips pages that fail extraction and reports errors at the end.
 */
export async function runCrawl(options: CrawlPipelineOptions): Promise<string> {
  const { url, format } = options;
  const progressTimer = startProgressTimer();

  try {
    const crawlOptions: CrawlOptions = {
      maxDepth: options.depth ?? 3,
      maxPages: options.maxPages ?? 50,
      requestDelayMs: options.delay ?? 500,
    };

    console.log(
      `Crawling: ${url} (depth=${crawlOptions.maxDepth}, max=${crawlOptions.maxPages} pages, delay=${crawlOptions.requestDelayMs}ms)`,
    );

    const fetchResults = await crawlSite(url, crawlOptions);
    console.log(`Fetched ${fetchResults.length} page(s). Extracting content...`);

    const pages: PageEntry[] = [];
    const errors: Array<{ url: string; error: string }> = [];

    for (let i = 0; i < fetchResults.length; i++) {
      const result = fetchResults[i];
      console.log(`  Extracting ${i + 1}/${fetchResults.length}: ${result.title || result.url}`);

      try {
        let content = extractContent(result.html, result.url);
        if (content.textContent) {
          if (options.translate) {
            console.log(`  🌐 Translating page ${i + 1}/${fetchResults.length}...`);
            content = await translateContent(content, options.translate);
          }
          pages.push({ url: result.url, content });
        } else {
          errors.push({ url: result.url, error: 'No content extracted' });
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ url: result.url, error: message });
      }
    }

    if (pages.length === 0) {
      throw new Error('No pages with extractable content were found during crawl');
    }

    const outputPath = options.output ?? generateOutputFilename(url, options.compress, options.translate);

    const pdfOptions: PdfOptions = {
      outputPath,
      title: `Site: ${new URL(url).hostname}`,
      format: format ?? 'A4',
      compress: options.compress,
      translate: options.translate,
      fontSize: options.fontSize,
    };

    console.log(`Generating PDF with ${pages.length} page(s): ${outputPath}`);
    const result = await generateMultiPagePdf(pages, pdfOptions);

    if (errors.length > 0) {
      console.warn(`\n⚠ ${errors.length} page(s) had issues:`);
      for (const e of errors) {
        console.warn(`  - ${e.url}: ${e.error}`);
      }
    }

    console.log(`\nDone — ${result}`);
    return result;
  } finally {
    clearTimeout(progressTimer);
  }
}

/**
 * Clean up all browser instances. Call after pipeline completes.
 */
export async function shutdown(): Promise<void> {
  await closeBrowser();
  await closePdfBrowser();
}

// ── Multi-URL list pipeline ──────────────────────────────────────

export interface ListPipelineOptions {
  urls: string[];
  output?: string;
  format?: 'A4' | 'Letter';
  compress?: boolean;
  translate?: string;
  fontSize?: 'small' | 'normal' | 'large';
}

/**
 * Run the list pipeline: fetch each URL → extract → optionally translate → combine into one PDF.
 */
export async function runList(options: ListPipelineOptions): Promise<string> {
  const { urls, format } = options;

  if (urls.length === 0) {
    throw new Error('No URLs provided. Pass a comma-separated list of URLs.');
  }

  const progressTimer = startProgressTimer();

  try {
    console.log(`Processing ${urls.length} URL(s)...`);

    const pages: PageEntry[] = [];
    const errors: Array<{ url: string; error: string }> = [];

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      console.log(`\n[${i + 1}/${urls.length}] Fetching: ${url}`);

      try {
        const fetchResult = await fetchUrl(url);
        if (fetchResult.statusCode >= 400) {
          errors.push({ url, error: `HTTP ${fetchResult.statusCode}` });
          continue;
        }

        let content = extractContent(fetchResult.html, url);
        if (!content.textContent) {
          errors.push({ url, error: 'No content extracted' });
          continue;
        }

        if (options.translate) {
          console.log(`  🤖 Summarizing & translating page ${i + 1}/${urls.length}...`);
          content = await translateContent(content, options.translate);
        }

        pages.push({ url, content });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ url, error: message });
      }
    }

    if (pages.length === 0) {
      throw new Error('No pages with extractable content were found');
    }

    const outputPath = options.output ?? generateListOutputFilename(urls, options.compress, options.translate);

    const pdfOptions: PdfOptions = {
      outputPath,
      title: `Combined: ${urls.length} pages`,
      format: format ?? 'A4',
      compress: options.compress,
      translate: options.translate,
      fontSize: options.fontSize,
    };

    console.log(`\nGenerating PDF with ${pages.length} page(s): ${outputPath}`);
    const result = await generateMultiPagePdf(pages, pdfOptions);

    if (errors.length > 0) {
      console.warn(`\n⚠ ${errors.length} URL(s) had issues:`);
      for (const e of errors) {
        console.warn(`  - ${e.url}: ${e.error}`);
      }
    }

    console.log(`\nDone — ${result}`);
    return result;
  } finally {
    clearTimeout(progressTimer);
  }
}

/**
 * Generate output filename for list mode using the first URL's hostname.
 */
function generateListOutputFilename(urls: string[], compress?: boolean, translate?: string): string {
  let slug = 'multi-site';
  try {
    const parsed = new URL(urls[0]);
    slug = parsed.hostname.replace(/[.\/_]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
  } catch { /* use default slug */ }

  const langSuffix = translate ? `-${translate}` : '';
  const compressSuffix = compress ? '-compressed' : '';
  return `${slug}-combined${langSuffix}${compressSuffix}.pdf`;
}


/**
 * Derive a clean output filename from a URL's hostname + pathname.
 * e.g. https://bradygaster.github.io/squad/docs/guide/ → squad-docs-guide.pdf
 * If compress is true: squad-docs-guide-compressed.pdf
 */
function generateOutputFilename(url: string, compress?: boolean, translate?: string): string {
  const parsed = new URL(url);
  const raw = (parsed.hostname + parsed.pathname)
    .replace(/[.\/_]+/g, '-')  // dots, slashes, underscores → hyphens
    .replace(/-+/g, '-')       // collapse consecutive hyphens
    .replace(/^-+|-+$/g, '')   // trim leading/trailing hyphens
    .toLowerCase();

  const trimmed = raw.slice(0, 80) || 'output';
  const langSuffix = translate ? `-${translate}` : '';
  const compressSuffix = compress ? '-compressed' : '';
  return `${trimmed}${langSuffix}${compressSuffix}.pdf`;
}

const PROGRESS_DELAY_MS = 10_000;

/**
 * Start a one-shot timer that prints a reassuring message after 10 seconds.
 */
function startProgressTimer(): ReturnType<typeof setTimeout> {
  return setTimeout(() => {
    console.log('⏳ Still working... fetching and processing pages. This may take a while for large sites.');
  }, PROGRESS_DELAY_MS);
}
