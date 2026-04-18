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
import {
  callGeminiWithRetry,
  summaryToHtml,
  GEMINI_MODELS,
} from '../services/gemini';

// Pipeline modules at runtime
const fetcherPath = path.resolve(__dirname, '..', '..', '..', 'fetcher');
const extractorPath = path.resolve(__dirname, '..', '..', '..', 'extractor');
const pdfGenPath = path.resolve(__dirname, '..', '..', '..', 'pdf-generator');
const pipelinePath = path.resolve(__dirname, '..', '..', '..', 'pipeline');

interface SummarizeBody {
  url: string;
  language: string;
  model?: string;
  apiKey: string;
}

function urlToSlug(url: string): string {
  try {
    const parsed = new URL(url);
    const raw = (parsed.hostname + parsed.pathname)
      .replace(/[.\/_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
    return raw.slice(0, 60) || 'output';
  } catch {
    return 'output';
  }
}

function getTempDir(): string {
  const dir = path.join(os.tmpdir(), 'sitetopdf-jobs');
  const fs = require('fs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export async function summarizeRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: SummarizeBody }>('/api/summarize', async (request, reply) => {
    const { url, language, model: requestModel, apiKey } = request.body;
    if (!url) return reply.code(400).send({ error: 'url is required' });
    if (!language) return reply.code(400).send({ error: 'language is required' });
    if (!apiKey) return reply.code(400).send({ error: 'apiKey is required' });

    const jobId = createJob();
    reply.send({ jobId });

    setImmediate(async () => {
      try {
        await pool.acquire();
        const model = requestModel || 'gemini-2.5-flash';
        const modelLabel = GEMINI_MODELS[model] || model;

        const sendProgress = (msg: string) => updateProgress(jobId, msg);

        sendProgress(`Fetching content from ${url}...`);

        const { fetchUrl } = require(fetcherPath);
        const { extractContent } = require(extractorPath);
        const { generatePdf } = require(pdfGenPath);
        const { shutdown } = require(pipelinePath);

        const fetchResult = await fetchUrl(url);
        const extracted = extractContent(fetchResult.html, url);

        const contentText: string = extracted.textContent || '';
        if (!contentText.trim()) {
          await shutdown();
          failJob(jobId, 'No text content could be extracted from this page.');
          return;
        }

        const truncated =
          contentText.length > 30000
            ? contentText.slice(0, 30000) + '\n\n[Content truncated for summarization]'
            : contentText;

        sendProgress(`Sending to ${modelLabel} for summarization in ${language}...`);

        const prompt = `Summarize this web page content in ${language}. Provide a clear, well-structured summary that captures the key points:\n\n${truncated}`;
        const summary = await callGeminiWithRetry(apiKey, prompt, model, sendProgress);

        sendProgress('Generating summary PDF...');
        const summaryContent = {
          title: `Summary: ${extracted.title || url}`,
          contentHtml: summaryToHtml(summary),
          textContent: summary,
        };

        const outputPath = path.join(getTempDir(), `${jobId}-summary.pdf`);
        await generatePdf(summaryContent, { outputPath, title: summaryContent.title }, url);
        await shutdown();

        const slug = urlToSlug(url);
        completeJob(jobId, outputPath, `${slug}-summary.pdf`);
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
