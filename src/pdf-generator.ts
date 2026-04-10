/**
 * PDF Generator — owned by Rafiki.
 *
 * Takes cleaned HTML content and renders it to a PDF file
 * using Playwright's built-in PDF generation (Chromium).
 *
 * Features:
 *   - Professional typography and page layout
 *   - Page numbers in footer
 *   - Source URL and generation date in the document
 *   - Image scaling (no overflow), orphaned-heading prevention
 *   - Phase 2: generateMultiPagePdf() for combining multiple pages
 */

import { chromium, type Browser } from 'playwright';
import { PdfOptions, ExtractedContent, PageEntry } from './types';

let _browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!_browser) {
    _browser = await chromium.launch({ headless: true });
  }
  return _browser;
}

// ── Shared CSS ───────────────────────────────────────────────────

const PDF_STYLES = `
  * { box-sizing: border-box; }

  body {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 11pt;
    line-height: 1.7;
    margin: 0;
    padding: 0;
    color: #1a1a1a;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  /* ── Headings ────────────────────────────────── */
  h1 {
    font-size: 22pt;
    font-weight: 700;
    margin: 0 0 0.6em 0;
    line-height: 1.3;
    color: #111;
    border-bottom: 2px solid #ddd;
    padding-bottom: 0.3em;
    page-break-after: avoid;
  }
  h2 {
    font-size: 17pt;
    font-weight: 600;
    margin: 1.4em 0 0.5em 0;
    line-height: 1.3;
    color: #222;
    page-break-after: avoid;
  }
  h3 {
    font-size: 14pt;
    font-weight: 600;
    margin: 1.2em 0 0.4em 0;
    line-height: 1.3;
    color: #333;
    page-break-after: avoid;
  }
  h4, h5, h6 {
    font-size: 12pt;
    font-weight: 600;
    margin: 1em 0 0.3em 0;
    line-height: 1.4;
    color: #444;
    page-break-after: avoid;
  }

  /* ── Body text ───────────────────────────────── */
  p {
    margin: 0 0 0.8em 0;
    orphans: 3;
    widows: 3;
  }
  a { color: #1a5276; text-decoration: underline; }

  ul, ol { margin: 0.5em 0 1em 0; padding-left: 2em; }
  li { margin-bottom: 0.3em; line-height: 1.6; }

  /* ── Images ──────────────────────────────────── */
  img {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 1em auto;
    page-break-inside: avoid;
  }
  figure { margin: 1em 0; page-break-inside: avoid; }
  figcaption { font-size: 9pt; color: #666; text-align: center; margin-top: 0.4em; }

  /* ── Code ─────────────────────────────────────── */
  pre {
    background: #f5f5f5;
    border: 1px solid #e0e0e0;
    border-radius: 4px;
    padding: 14px 16px;
    font-size: 9pt;
    line-height: 1.5;
    page-break-inside: avoid;
    white-space: pre-wrap;
    word-wrap: break-word;
  }
  code {
    font-family: Consolas, Monaco, 'Courier New', monospace;
    background: #f5f5f5;
    padding: 1px 4px;
    border-radius: 3px;
    font-size: 9.5pt;
  }
  pre code { background: none; padding: 0; border-radius: 0; }

  /* ── Tables ──────────────────────────────────── */
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 1em 0;
    font-size: 10pt;
    page-break-inside: auto;
  }
  th, td { border: 1px solid #ccc; padding: 8px 12px; text-align: left; vertical-align: top; }
  th { background: #f0f0f0; font-weight: 600; }
  tr:nth-child(even) { background: #fafafa; }

  /* ── Blockquote ──────────────────────────────── */
  blockquote {
    margin: 1em 0;
    padding: 0.5em 1em;
    border-left: 4px solid #ccc;
    color: #555;
    background: #fafafa;
    page-break-inside: avoid;
  }

  hr { border: none; border-top: 1px solid #ddd; margin: 2em 0; }

  /* ── Multi-page helpers ──────────────────────── */
  .page-separator { page-break-before: always; }
  .page-title-block {
    margin-bottom: 1.5em;
    padding-bottom: 0.5em;
    border-bottom: 1px solid #ccc;
  }
  .page-title-block .page-url {
    font-size: 9pt;
    color: #777;
    word-break: break-all;
    margin-top: 0.3em;
  }

  .cover-page { text-align: center; padding-top: 30%; }
  .cover-page h1 { font-size: 28pt; border: none; margin-bottom: 0.5em; }
  .cover-page .generated-date { font-size: 10pt; color: #888; margin-top: 2em; }

  .toc { page-break-after: always; }
  .toc h2 { font-size: 18pt; margin-bottom: 1em; }
  .toc ol { list-style: decimal; padding-left: 1.5em; }
  .toc li { margin-bottom: 0.6em; font-size: 11pt; }
  .toc a { color: #1a5276; text-decoration: none; }
  .toc .toc-url { display: block; font-size: 8.5pt; color: #999; word-break: break-all; }

  .meta-block {
    font-size: 9pt;
    color: #888;
    margin-bottom: 2em;
    border-bottom: 1px solid #eee;
    padding-bottom: 0.5em;
  }
`;

const COMPRESSED_STYLES = `
  * { box-sizing: border-box; }

  body {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 9pt;
    line-height: 1.35;
    margin: 0;
    padding: 0;
    color: #1a1a1a;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  /* ── Headings ────────────────────────────────── */
  h1 {
    font-size: 17pt;
    font-weight: 700;
    margin: 0 0 0.35em 0;
    line-height: 1.15;
    color: #111;
    border-bottom: 2px solid #ddd;
    padding-bottom: 0.2em;
    page-break-after: avoid;
  }
  h2 {
    font-size: 14pt;
    font-weight: 600;
    margin: 0.85em 0 0.3em 0;
    line-height: 1.15;
    color: #222;
    page-break-after: avoid;
  }
  h3 {
    font-size: 12pt;
    font-weight: 600;
    margin: 0.7em 0 0.25em 0;
    line-height: 1.15;
    color: #333;
    page-break-after: avoid;
  }
  h4, h5, h6 {
    font-size: 10pt;
    font-weight: 600;
    margin: 0.6em 0 0.2em 0;
    line-height: 1.15;
    color: #444;
    page-break-after: avoid;
  }

  /* ── Body text ───────────────────────────────── */
  p {
    margin: 0 0 0.4em 0;
    orphans: 3;
    widows: 3;
  }
  a { color: #1a5276; text-decoration: underline; }

  ul, ol { margin: 0.3em 0 0.6em 0; padding-left: 2em; }
  li { margin-bottom: 0.2em; line-height: 1.4; }

  /* ── Images ──────────────────────────────────── */
  img {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 0.6em auto;
    page-break-inside: avoid;
  }
  figure { margin: 0.6em 0; page-break-inside: avoid; }
  figcaption { font-size: 7.5pt; color: #666; text-align: center; margin-top: 0.3em; }

  /* ── Code ─────────────────────────────────────── */
  pre {
    background: #f5f5f5;
    border: 1px solid #e0e0e0;
    border-radius: 4px;
    padding: 8px 10px;
    font-size: 8pt;
    line-height: 1.4;
    page-break-inside: avoid;
    white-space: pre-wrap;
    word-wrap: break-word;
  }
  code {
    font-family: Consolas, Monaco, 'Courier New', monospace;
    background: #f5f5f5;
    padding: 1px 4px;
    border-radius: 3px;
    font-size: 8pt;
  }
  pre code { background: none; padding: 0; border-radius: 0; }

  /* ── Tables ──────────────────────────────────── */
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 0.6em 0;
    font-size: 8.5pt;
    page-break-inside: auto;
  }
  th, td { border: 1px solid #ccc; padding: 6px 9px; text-align: left; vertical-align: top; }
  th { background: #f0f0f0; font-weight: 600; }
  tr:nth-child(even) { background: #fafafa; }

  /* ── Blockquote ──────────────────────────────── */
  blockquote {
    margin: 0.6em 0;
    padding: 0.4em 0.8em;
    border-left: 3px solid #ccc;
    color: #555;
    background: #fafafa;
    font-size: 8.5pt;
    page-break-inside: avoid;
  }

  hr { border: none; border-top: 1px solid #ddd; margin: 1.2em 0; }

  /* ── Multi-page helpers ──────────────────────── */
  .page-separator { page-break-before: always; }
  .page-title-block {
    margin-bottom: 1em;
    padding-bottom: 0.3em;
    border-bottom: 1px solid #ccc;
  }
  .page-title-block .page-url {
    font-size: 7.5pt;
    color: #777;
    word-break: break-all;
    margin-top: 0.2em;
  }

  .cover-page { text-align: center; padding-top: 30%; }
  .cover-page h1 { font-size: 22pt; border: none; margin-bottom: 0.4em; }
  .cover-page .generated-date { font-size: 8.5pt; color: #888; margin-top: 1.5em; }

  .toc { page-break-after: always; }
  .toc h2 { font-size: 14pt; margin-bottom: 0.8em; }
  .toc ol { list-style: decimal; padding-left: 1.5em; }
  .toc li { margin-bottom: 0.4em; font-size: 9pt; }
  .toc a { color: #1a5276; text-decoration: none; }
  .toc .toc-url { display: block; font-size: 7pt; color: #999; word-break: break-all; }

  .meta-block {
    font-size: 7.5pt;
    color: #888;
    margin-bottom: 1.2em;
    border-bottom: 1px solid #eee;
    padding-bottom: 0.3em;
  }
`;

// ── RTL support ──────────────────────────────────────────────────

function isRtlLanguage(lang?: string): boolean {
  return ['he', 'ar', 'fa', 'ur'].includes(lang ?? '');
}

/**
 * Build RTL CSS overrides to layer on top of the base styles.
 * Adjusts direction, font stack, list/blockquote padding, and keeps
 * code blocks + URLs in LTR. Line-height is tuned for Hebrew readability.
 */
function buildRtlStyles(compress = false): string {
  const lineHeight = compress ? '1.45' : '1.8';
  const blockquotePadding = compress ? '0.4em 0.8em 0.4em 0.4em' : '0.5em 1em 0.5em 0.5em';
  const blockquoteBorder = compress ? '3px' : '4px';

  return `
  /* ── RTL overrides ─────────────────────────────── */
  body {
    direction: rtl;
    text-align: right;
    font-family: 'Segoe UI', 'Arial Hebrew', 'Noto Sans Hebrew', Arial, sans-serif;
    line-height: ${lineHeight};
  }

  /* Swap directional padding on lists */
  ul, ol { padding-left: 0; padding-right: 2em; }

  /* Table cells align right */
  th, td { text-align: right; }

  /* Blockquote: border on right side for RTL */
  blockquote {
    border-left: none;
    border-right: ${blockquoteBorder} solid #ccc;
    padding: ${blockquotePadding};
  }

  /* TOC list padding swapped */
  .toc ol { padding-left: 0; padding-right: 1.5em; }

  /* Cover page stays centered */
  .cover-page { text-align: center; }

  /* Code blocks remain LTR — code is always left-to-right */
  pre, code {
    direction: ltr;
    text-align: left;
    unicode-bidi: bidi-override;
  }

  /* URLs and technical references remain LTR */
  a[href], .page-url, .toc-url, .meta-block a {
    direction: ltr;
    unicode-bidi: embed;
  }

  /* Bilingual title: original title shown as reference annotation */
  .original-title {
    font-size: 9pt;
    color: #777;
    font-style: italic;
    margin-top: 0.2em;
    margin-bottom: 0.5em;
    direction: ltr;
    unicode-bidi: embed;
  }
  `;
}

// ── Header / footer templates ────────────────────────────────────

const HEADER_FOOTER_BASE_STYLE =
  'font-family: Arial, "Segoe UI", sans-serif; font-size: 9px; color: #999; width: 100%; padding: 0 18mm;';

function buildHeaderTemplate(title?: string, compress = false, rtl = false): string {
  const left = title ? escapeHtml(truncate(title, 60)) : '';
  const fontSize = compress ? '8px' : '10px';
  const direction = rtl ? 'direction: rtl;' : '';
  return `<div style="font-size: ${fontSize}; font-family: Arial, sans-serif; color: #999; width: 100%; display: flex; justify-content: space-between; padding: 0 20px; ${direction}">
    <span>${left}</span>
    <span>${formatDate()}</span>
  </div>`;
}

function buildFooterTemplate(compress = false, rtl = false): string {
  const fontSize = compress ? '8px' : '10px';
  const textAlign = rtl ? 'right' : 'center';
  const direction = rtl ? 'direction: rtl;' : '';
  return `<div style="font-size: ${fontSize}; font-family: Arial, sans-serif; color: #888; width: 100%; text-align: ${textAlign}; margin: 0; padding: 0; ${direction}">
    <span>Page </span><span class="pageNumber"></span><span> of </span><span class="totalPages"></span>
  </div>`;
}

// ── Utilities ────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

// ── Single-page HTML wrapper ─────────────────────────────────────

function wrapInHtmlDocument(content: ExtractedContent, sourceUrl?: string, compress = false, translate?: string): string {
  const rtl = isRtlLanguage(translate);
  const lang = translate || 'en';
  const dirAttr = rtl ? ` dir="rtl"` : '';

  const metaParts = [`Generated: ${formatDate()}`];
  if (sourceUrl) {
    metaParts.unshift(`Source: <a href="${escapeHtml(sourceUrl)}">${escapeHtml(sourceUrl)}</a>`);
  }

  const baseStyles = compress ? COMPRESSED_STYLES : PDF_STYLES;
  const styles = rtl ? baseStyles + buildRtlStyles(compress) : baseStyles;

  // Bilingual title: show original title as reference when content is translated
  const originalTitleHtml = rtl && content.originalTitle
    ? `\n  <div class="original-title">Original: ${escapeHtml(content.originalTitle)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="${lang}"${dirAttr}>
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(content.title)}</title>
  <style>${styles}</style>
</head>
<body>
  <h1>${escapeHtml(content.title)}</h1>${originalTitleHtml}
  <div class="meta-block">${metaParts.join('<br>')}</div>
  ${content.contentHtml}
</body>
</html>`;
}

// ── Multi-page HTML wrapper ──────────────────────────────────────

function wrapMultiPageDocument(pages: PageEntry[], title?: string, compress = false, translate?: string): string {
  const rtl = isRtlLanguage(translate);
  const lang = translate || 'en';
  const dirAttr = rtl ? ` dir="rtl"` : '';
  const docTitle = title || 'Combined Pages';
  const date = formatDate();

  const baseStyles = compress ? COMPRESSED_STYLES : PDF_STYLES;
  const styles = rtl ? baseStyles + buildRtlStyles(compress) : baseStyles;

  const coverHtml = `
    <div class="cover-page">
      <h1>${escapeHtml(docTitle)}</h1>
      <p style="font-size: ${compress ? '10pt' : '12pt'}; color: #666;">${pages.length} page${pages.length === 1 ? '' : 's'}</p>
      <p class="generated-date">Generated: ${date}</p>
    </div>`;

  const tocItems = pages.map((p, i) => {
    const pageTitle = p.content.title || `Page ${i + 1}`;
    return `<li>
      <a href="#page-${i}">${escapeHtml(pageTitle)}</a>
      <span class="toc-url">${escapeHtml(p.url)}</span>
    </li>`;
  }).join('\n');

  const tocHtml = `
    <div class="toc page-separator">
      <h2>Table of Contents</h2>
      <ol>${tocItems}</ol>
    </div>`;

  const contentPages = pages.map((p, i) => {
    const pageTitle = p.content.title || `Page ${i + 1}`;
    // Bilingual title for translated content
    const originalTitleHtml = rtl && p.content.originalTitle
      ? `\n        <div class="original-title">Original: ${escapeHtml(p.content.originalTitle)}</div>`
      : '';
    return `
    <div class="page-separator" id="page-${i}">
      <div class="page-title-block">
        <h1>${escapeHtml(pageTitle)}</h1>${originalTitleHtml}
        <div class="page-url">${escapeHtml(p.url)}</div>
      </div>
      ${p.content.contentHtml}
    </div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="${lang}"${dirAttr}>
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(docTitle)}</title>
  <style>${styles}</style>
</head>
<body>
  ${coverHtml}
  ${tocHtml}
  ${contentPages}
</body>
</html>`;
}

// ── Public API ───────────────────────────────────────────────────

/**
 * Generate a PDF from extracted content.
 *
 * @param content   - Extracted page content.
 * @param options   - PDF output options (path, title, format, compress).
 * @param sourceUrl - Optional source URL shown in the document header.
 */
export async function generatePdf(
  content: ExtractedContent,
  options: PdfOptions,
  sourceUrl?: string,
): Promise<string> {
  const browser = await getBrowser();
  const context = await browser.newContext();
  const page = await context.newPage();

  const compress = options.compress ?? false;
  const translate = options.translate;
  const rtl = isRtlLanguage(translate);

  try {
    const htmlDoc = wrapInHtmlDocument(content, sourceUrl, compress, translate);
    await page.setContent(htmlDoc, { waitUntil: 'networkidle' });

    await page.pdf({
      path: options.outputPath,
      format: options.format ?? 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: buildHeaderTemplate(options.title ?? content.title, compress, rtl),
      footerTemplate: buildFooterTemplate(compress, rtl),
      margin: compress
        ? { top: '15mm', right: '12mm', bottom: '15mm', left: '12mm' }
        : { top: '25mm', right: '18mm', bottom: '25mm', left: '18mm' },
    });

    return options.outputPath;
  } finally {
    await context.close();
  }
}

/**
 * Generate a single PDF from multiple pages, with a cover page,
 * table of contents, and page separators between each URL's content.
 *
 * Phase 2 entry point for multi-URL crawling.
 */
export async function generateMultiPagePdf(
  pages: PageEntry[],
  options: PdfOptions,
): Promise<string> {
  if (pages.length === 0) {
    throw new Error('No pages provided for PDF generation');
  }

  const browser = await getBrowser();
  const context = await browser.newContext();
  const page = await context.newPage();

  const compress = options.compress ?? false;
  const translate = options.translate;
  const rtl = isRtlLanguage(translate);

  try {
    const htmlDoc = wrapMultiPageDocument(pages, options.title, compress, translate);
    await page.setContent(htmlDoc, { waitUntil: 'networkidle' });

    await page.pdf({
      path: options.outputPath,
      format: options.format ?? 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: buildHeaderTemplate(options.title, compress, rtl),
      footerTemplate: buildFooterTemplate(compress, rtl),
      margin: compress
        ? { top: '15mm', right: '12mm', bottom: '15mm', left: '12mm' }
        : { top: '25mm', right: '18mm', bottom: '25mm', left: '18mm' },
    });

    return options.outputPath;
  } finally {
    await context.close();
  }
}

/**
 * Shut down the PDF browser instance.Call once when the pipeline is done.
 */
export async function closePdfBrowser(): Promise<void> {
  if (_browser) {
    await _browser.close();
    _browser = null;
  }
}
