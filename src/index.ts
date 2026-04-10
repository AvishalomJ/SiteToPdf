#!/usr/bin/env node

/**
 * SiteToPdf — CLI entry point.
 *
 * Usage:
 *   site-to-pdf <url> [-o output.pdf] [--format A4|Letter]
 *   site-to-pdf crawl <url> [-o output.pdf] [--depth N] [--max-pages N] [--delay Ms] [--format A4|Letter]
 */

import { Command } from 'commander';
import { runSingleUrl, runCrawl, runList, shutdown } from './pipeline';

const program = new Command();

program
  .name('site-to-pdf')
  .description('Fetch a URL (or crawl a site), extract content, and generate a PDF')
  .version('0.1.0');

// Default command: single-URL fetch → PDF
// { isDefault: true } means `site-to-pdf <url>` still works without typing "fetch"
program
  .command('fetch <url>', { isDefault: true })
  .description('Fetch a single URL and convert to PDF')
  .option('-o, --output <path>', 'Output PDF file path')
  .option('--format <format>', 'Page format: A4 or Letter', 'A4')
  .option('--compress', 'Compress pages to fit more content per page')
  .option('--translate <lang>', 'Summarize & translate content via AI (e.g., he for Hebrew)')
  .action(async (url: string, opts: { output?: string; format?: string; compress?: boolean; translate?: string }) => {
    try {
      const format = opts.format === 'Letter' ? 'Letter' : 'A4';
      await runSingleUrl({ url, output: opts.output, format, compress: opts.compress, translate: opts.translate });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error: ${message}`);
      process.exit(1);
    } finally {
      await shutdown();
    }
  });

// Crawl command: multi-URL site crawl → combined PDF
program
  .command('crawl <url>')
  .description('Crawl all pages under a URL and generate a combined PDF')
  .option('-o, --output <path>', 'Output PDF file path')
  .option('--depth <n>', 'Max crawl depth', '3')
  .option('--max-pages <n>', 'Max pages to include', '50')
  .option('--delay <ms>', 'Delay between requests in ms', '500')
  .option('--format <format>', 'Page format: A4 or Letter', 'A4')
  .option('--compress', 'Compress pages to fit more content per page')
  .option('--translate <lang>', 'Summarize & translate content via AI (e.g., he for Hebrew)')
  .action(async (url: string, opts: { output?: string; depth?: string; maxPages?: string; delay?: string; format?: string; compress?: boolean; translate?: string }) => {
    try {
      const format = opts.format === 'Letter' ? 'Letter' : 'A4';
      await runCrawl({
        url,
        output: opts.output,
        format,
        depth: parseInt(opts.depth ?? '3', 10),
        maxPages: parseInt(opts.maxPages ?? '50', 10),
        delay: parseInt(opts.delay ?? '500', 10),
        compress: opts.compress,
        translate: opts.translate,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error: ${message}`);
      process.exit(1);
    } finally {
      await shutdown();
    }
  });

// List command: comma-separated URLs → combined PDF
program
  .command('list <urls>')
  .description('Process a comma-separated list of URLs into a combined PDF')
  .option('-o, --output <path>', 'Output PDF file path')
  .option('--format <format>', 'Page format: A4 or Letter', 'A4')
  .option('--compress', 'Compress pages to fit more content per page')
  .option('--translate <lang>', 'Summarize & translate content via AI (e.g., he for Hebrew)')
  .action(async (urls: string, opts: { output?: string; format?: string; compress?: boolean; translate?: string }) => {
    try {
      const format = opts.format === 'Letter' ? 'Letter' : 'A4';
      await runList({
        urls: urls.split(',').map((u) => u.trim()).filter(Boolean),
        output: opts.output,
        format,
        compress: opts.compress,
        translate: opts.translate,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error: ${message}`);
      process.exit(1);
    } finally {
      await shutdown();
    }
  });

program.parse();
