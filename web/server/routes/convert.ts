import { FastifyInstance } from 'fastify';
import path from 'path';
import os from 'os';
import {
  createJob,
  updateProgress,
  completeJob,
  failJob,
} from '../services/job-manager';
import * as pool from '../services/browser-pool';

// Pipeline modules — imported from compiled dist at runtime
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pipelinePath = path.resolve(__dirname, '..', '..', '..', 'pipeline');

interface SingleBody {
  url: string;
  format?: 'A4' | 'Letter';
  compress?: boolean;
  output?: string;
}

interface CrawlBody {
  url: string;
  format?: 'A4' | 'Letter';
  compress?: boolean;
  maxDepth?: number;
  maxPages?: number;
  delay?: number;
}

interface ListBody {
  urls: string[];
  format?: 'A4' | 'Letter';
  compress?: boolean;
}

function getTempDir(): string {
  const dir = path.join(os.tmpdir(), 'sitetopdf-jobs');
  const fs = require('fs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Intercept console.log during a pipeline run to forward messages
 * to the job manager as progress updates.
 */
function withConsoleCapture(jobId: string, fn: () => Promise<string>): Promise<string> {
  const origLog = console.log;
  const origWarn = console.warn;
  console.log = (...args: unknown[]) => {
    const msg = args.map(String).join(' ');
    updateProgress(jobId, msg);
  };
  console.warn = (...args: unknown[]) => {
    const msg = args.map(String).join(' ');
    updateProgress(jobId, `⚠ ${msg}`);
  };
  return fn().finally(() => {
    console.log = origLog;
    console.warn = origWarn;
  });
}

export async function convertRoutes(app: FastifyInstance): Promise<void> {
  /** POST /api/convert/single — convert a single URL to PDF */
  app.post<{ Body: SingleBody }>('/api/convert/single', async (request, reply) => {
    const { url, format, compress, output } = request.body;
    if (!url) return reply.code(400).send({ error: 'url is required' });

    const jobId = createJob();
    reply.send({ jobId });

    // Run asynchronously
    setImmediate(async () => {
      try {
        await pool.acquire();
        updateProgress(jobId, `Starting single-URL conversion: ${url}`);

        const { runSingleUrl, shutdown } = require(pipelinePath);
        const outputPath =
          output || path.join(getTempDir(), `${jobId}.pdf`);

        const result = await withConsoleCapture(jobId, () =>
          runSingleUrl({ url, format, compress, output: outputPath }),
        );
        await shutdown();
        completeJob(jobId, result);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        failJob(jobId, msg);
        try {
          const { shutdown } = require(pipelinePath);
          await shutdown();
        } catch { /* best effort */ }
      } finally {
        pool.release();
      }
    });
  });

  /** POST /api/convert/crawl — crawl a site and generate a combined PDF */
  app.post<{ Body: CrawlBody }>('/api/convert/crawl', async (request, reply) => {
    const { url, format, compress, maxDepth, maxPages, delay } = request.body;
    if (!url) return reply.code(400).send({ error: 'url is required' });

    const jobId = createJob();
    reply.send({ jobId });

    setImmediate(async () => {
      try {
        await pool.acquire();
        updateProgress(jobId, `Starting crawl: ${url}`);

        const { runCrawl, shutdown } = require(pipelinePath);
        const outputPath = path.join(getTempDir(), `${jobId}.pdf`);

        const result = await withConsoleCapture(jobId, () =>
          runCrawl({
            url,
            format,
            compress,
            depth: maxDepth,
            maxPages,
            delay,
            output: outputPath,
          }),
        );
        await shutdown();
        completeJob(jobId, result);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        failJob(jobId, msg);
        try {
          const { shutdown } = require(pipelinePath);
          await shutdown();
        } catch { /* best effort */ }
      } finally {
        pool.release();
      }
    });
  });

  /** POST /api/convert/list — convert a list of URLs to a combined PDF */
  app.post<{ Body: ListBody }>('/api/convert/list', async (request, reply) => {
    const { urls, format, compress } = request.body;
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return reply.code(400).send({ error: 'urls array is required' });
    }

    const jobId = createJob();
    reply.send({ jobId });

    setImmediate(async () => {
      try {
        await pool.acquire();
        updateProgress(jobId, `Starting list conversion: ${urls.length} URL(s)`);

        const { runList, shutdown } = require(pipelinePath);
        const outputPath = path.join(getTempDir(), `${jobId}.pdf`);

        const result = await withConsoleCapture(jobId, () =>
          runList({ urls, format, compress, output: outputPath }),
        );
        await shutdown();
        completeJob(jobId, result);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        failJob(jobId, msg);
        try {
          const { shutdown } = require(pipelinePath);
          await shutdown();
        } catch { /* best effort */ }
      } finally {
        pool.release();
      }
    });
  });
}
