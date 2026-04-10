/**
 * Content Extractor — owned by Rafiki.
 *
 * Takes raw HTML and strips navigation, menus, footers, sidebars,
 * cookie banners, ads, comment sections, and other non-content elements.
 * Returns clean HTML + plain text.
 *
 * Uses Cheerio for lightweight server-side DOM manipulation.
 * Content detection uses a multi-strategy cascade: known selectors first,
 * then readability-style scoring on candidate containers.
 */

import * as cheerio from 'cheerio';
import type { AnyNode, Element } from 'domhandler';
import { ExtractedContent } from './types';

// ── Noise selectors ──────────────────────────────────────────────

/** CSS selectors for elements to remove before content extraction. */
const NOISE_SELECTORS: string[] = [
  // Structural navigation / layout
  'nav', 'header', 'footer', 'aside',
  '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
  '[role="complementary"]',
  '.nav', '.navbar', '.menu', '.sidebar',
  '.header', '.footer',
  '.breadcrumb', '.pagination',
  '.top-bar', '.bottom-bar',
  '.site-header', '.site-footer', '.site-nav',
  '#header', '#footer', '#nav', '#sidebar', '#menu', '#navigation',

  // Cookie consent / GDPR banners
  '.cookie-banner', '.cookie-bar', '.cookie-notice', '.cookie-consent',
  '.cookie-popup', '.cookie-modal', '.cookie-overlay',
  '[class*="cookie-"]', '[id*="cookie"]',
  '.consent', '.consent-banner', '.consent-bar',
  '.gdpr', '.gdpr-banner', '.gdpr-consent',
  '#gdpr-consent', '#consent-banner',
  '.cc-banner', '.cc-window', '.cc-revoke',

  // Popups / Modals / Overlays
  '.modal', '.modal-backdrop', '.modal-overlay',
  '.overlay', '.popup', '.lightbox',
  '.dialog', '[role="dialog"]',
  '.interstitial',

  // Social sharing widgets
  '.share', '.social', '.social-share', '.share-buttons',
  '.social-links', '.social-icons', '.share-bar',
  '.sharing', '.addthis', '.sharethis',

  // Ads
  '.ad', '.ads', '.advertisement', '.sponsored',
  '.ad-banner', '.ad-container', '.ad-wrapper',
  '[class*="ad-"]', '[class*="ads-"]',
  '.adsbygoogle', '#ad-container',
  'ins.adsbygoogle',

  // Comment sections
  '.comments', '.comment-section', '.comment-list',
  '#comments', '#disqus_thread', '#respond',
  '.disqus', '.comment-form',

  // Newsletter / signup prompts
  '.newsletter', '.subscribe', '.signup-form',

  // Notification / announcement bars
  '.alert', '.notification-bar', '.announcement-bar',

  // Search widgets
  '.search-form', '.search-box',

  // Screenreader-only / skip links
  '.skip-link', '.screen-reader-text', '.sr-only',

  // Scripts, styles, embeds
  'script', 'style', 'noscript',
  'iframe', 'svg',
  'link[rel="stylesheet"]',
];

// ── Content selectors (priority order) ───────────────────────────

const CONTENT_SELECTORS: string[] = [
  'main',
  '[role="main"]',
  'article',
  '#main-content',
  '#content',
  '#main',
  '.main-content',
  '.content',
  '.post-content',
  '.entry-content',
  '.article-content',
  '.article-body',
  '.page-content',
  '.post-body',
  '.story-body',
];

// ── Scoring heuristic ────────────────────────────────────────────

/**
 * Score a candidate container for how likely it is to hold main content.
 * Positive signals: text length, paragraph count, heading count.
 * Negative signals: high link density, short text, nav-like class names.
 */
function scoreElement($: cheerio.CheerioAPI, el: Element): number {
  const $el = $(el);
  const text = $el.text().trim();

  if (text.length === 0) return -1;

  let score = 0;

  // Text length (capped contribution)
  score += Math.min(text.length / 100, 50);

  // Paragraphs are a strong signal
  score += $el.find('p').length * 3;

  // Headings inside suggest structured content
  score += $el.find('h1, h2, h3, h4, h5, h6').length * 2;

  // Lists and images suggest real content
  score += $el.find('ul, ol').length;
  score += $el.find('img').length;

  // Link-density penalty (high ratio → navigation)
  const linkTextLen = $el.find('a').text().trim().length;
  const linkDensity = text.length > 0 ? linkTextLen / text.length : 0;
  if (linkDensity > 0.5) score -= 30;
  if (linkDensity > 0.7) score -= 50;

  // Short content penalty
  if (text.length < 50) score -= 20;

  // Class/id bonus or penalty
  const classAndId = `${$el.attr('class') ?? ''} ${$el.attr('id') ?? ''}`.toLowerCase();
  if (/content|article|post|story|entry|main|body|text/.test(classAndId)) score += 15;
  if (/sidebar|nav|menu|footer|header|comment|ad|widget/.test(classAndId)) score -= 25;

  return score;
}

/**
 * Find the best content container using a multi-strategy cascade:
 *   1. Known content selectors (most reliable).
 *   2. Scoring candidate div/section elements (readability-style).
 *   3. Fall back to <body>.
 */
function findMainContent($: cheerio.CheerioAPI): cheerio.Cheerio<AnyNode> {
  // Strategy 1: known content selectors
  for (const selector of CONTENT_SELECTORS) {
    const $candidates = $(selector);
    if ($candidates.length === 0) continue;

    // Pick the candidate with the most text (handles pages with multiple <article> tags, etc.)
    let best = $candidates.first();
    let bestLen = best.text().trim().length;
    $candidates.each((_, el) => {
      const len = $(el).text().trim().length;
      if (len > bestLen) {
        best = $(el);
        bestLen = len;
      }
    });

    if (bestLen > 100) return best;
  }

  // Strategy 2: score candidate containers
  let bestEl: Element | null = null;
  let bestScore = -Infinity;

  $('div, section, article').each((_, el) => {
    const s = scoreElement($, el as Element);
    if (s > bestScore) {
      bestScore = s;
      bestEl = el as Element;
    }
  });

  if (bestEl && bestScore > 10) {
    return $(bestEl);
  }

  // Strategy 3: fall back to body
  return $('body');
}

// ── Cleanup helpers ──────────────────────────────────────────────

/**
 * Remove elements that are empty (no text, no media children).
 * Runs multiple passes since removing a child may empty its parent.
 */
function removeEmptyElements($: cheerio.CheerioAPI, $content: cheerio.Cheerio<AnyNode>): void {
  for (let pass = 0; pass < 3; pass++) {
    $content.find('div, span, p, section, ul, ol').each((_, el) => {
      const $el = $(el);
      const text = $el.text().trim();
      const hasMedia = $el.find('img, video, canvas, picture, table').length > 0;
      if (text.length === 0 && !hasMedia) {
        $el.remove();
      }
    });
  }
}

/**
 * Make relative URLs absolute given a base URL.
 */
function fixRelativeUrls($: cheerio.CheerioAPI, baseUrl: string): void {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return;
  }

  const resolve = (href: string): string => {
    if (!href || /^(data:|javascript:|#|mailto:)/.test(href)) return href;
    try {
      return new URL(href, base).href;
    } catch {
      return href;
    }
  };

  $('a[href]').each((_, el) => {
    const $el = $(el);
    $el.attr('href', resolve($el.attr('href') ?? ''));
  });

  $('img[src]').each((_, el) => {
    const $el = $(el);
    $el.attr('src', resolve($el.attr('src') ?? ''));
  });

  // Handle srcset on <img> and <source>
  $('img[srcset], source[srcset]').each((_, el) => {
    const $el = $(el);
    const srcset = $el.attr('srcset') ?? '';
    const fixed = srcset.split(',').map(entry => {
      const parts = entry.trim().split(/\s+/);
      if (parts.length >= 1) parts[0] = resolve(parts[0]);
      return parts.join(' ');
    }).join(', ');
    $el.attr('srcset', fixed);
  });

  $('source[src]').each((_, el) => {
    const $el = $(el);
    $el.attr('src', resolve($el.attr('src') ?? ''));
  });
}

/**
 * Strip data-* attributes and inline event handlers that add noise to the HTML.
 */
function stripNoisyAttributes($: cheerio.CheerioAPI, $content: cheerio.Cheerio<AnyNode>): void {
  $content.find('*').each((_, el) => {
    if (el.type !== 'tag') return;
    const $el = $(el);
    for (const attr of Object.keys(el.attribs)) {
      if (attr.startsWith('data-') || attr.startsWith('on')) {
        $el.removeAttr(attr);
      }
    }
  });
}

// ── Public API ───────────────────────────────────────────────────

/**
 * Extract main content from raw HTML, stripping navigation and noise.
 *
 * @param html    - Raw HTML string from the fetcher.
 * @param baseUrl - Optional base URL for resolving relative links.
 * @returns Cleaned content with title, HTML, and plain-text.
 */
export function extractContent(html: string, baseUrl?: string): ExtractedContent {
  // Edge case: empty or missing input
  if (!html || html.trim().length === 0) {
    return { title: '', contentHtml: '', textContent: '' };
  }

  const $ = cheerio.load(html);

  // Grab the title before we strip <head> elements
  const title =
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('title').text().trim() ||
    $('h1').first().text().trim() ||
    '';

  // Strip noise
  for (const selector of NOISE_SELECTORS) {
    try { $(selector).remove(); } catch { /* invalid selector for this doc — skip */ }
  }

  // Fix relative URLs while the full DOM is still intact
  if (baseUrl) {
    fixRelativeUrls($, baseUrl);
  }

  // Locate main content
  const $content = findMainContent($);

  // Post-processing cleanup
  removeEmptyElements($, $content);
  stripNoisyAttributes($, $content);

  let contentHtml = $content.html()?.trim() ?? '';

  // Collapse excessive whitespace
  contentHtml = contentHtml
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();

  const textContent = $content.text().replace(/\s+/g, ' ').trim();

  // Edge case: completely empty page
  if (textContent.length === 0 && contentHtml.length === 0) {
    return { title, contentHtml: '', textContent: '' };
  }

  return { title, contentHtml, textContent };
}
