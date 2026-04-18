import { FastifyInstance } from 'fastify';
import { getJob, onProgress, onDone, deleteJob } from '../services/job-manager';
import fs from 'fs';
import path from 'path';

export async function jobRoutes(app: FastifyInstance): Promise<void> {
  /**
   * SSE endpoint — streams real-time progress for a job.
   * Sends all existing progress lines first, then live updates.
   */
  app.get('/api/jobs/:id/status', async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = getJob(id);
    if (!job) {
      return reply.code(404).send({ error: 'Job not found' });
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    // Send existing progress lines
    for (const msg of job.progress) {
      reply.raw.write(`event: progress\ndata: ${JSON.stringify({ message: msg, status: job.status })}\n\n`);
    }

    // If the job is already terminal, close immediately
    if (job.status === 'completed' || job.status === 'failed') {
      const eventName = job.status === 'completed' ? 'complete' : 'error';
      reply.raw.write(
        `event: ${eventName}\ndata: ${JSON.stringify({ status: job.status, jobId: id, displayFilename: job.displayFilename, outputPath: job.outputPath, error: job.error })}\n\n`,
      );
      reply.raw.end();
      return;
    }

    // Stream live updates
    const offProgress = onProgress(id, (msg: string) => {
      const current = getJob(id);
      reply.raw.write(
        `event: progress\ndata: ${JSON.stringify({ message: msg, status: current?.status })}\n\n`,
      );
    });

    const offDone = onDone(id, () => {
      const final = getJob(id);
      const eventName = final?.status === 'completed' ? 'complete' : 'error';
      reply.raw.write(
        `event: ${eventName}\ndata: ${JSON.stringify({ status: final?.status, jobId: id, displayFilename: final?.displayFilename, outputPath: final?.outputPath, error: final?.error })}\n\n`,
      );
      cleanup();
      reply.raw.end();
    });

    function cleanup() {
      offProgress();
      offDone();
    }

    // Client disconnect
    request.raw.on('close', cleanup);
  });

  /** Download the output PDF, then clean up the job. */
  app.get('/api/jobs/:id/download', async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = getJob(id);
    if (!job) {
      return reply.code(404).send({ error: 'Job not found' });
    }
    if (job.status !== 'completed' || !job.outputPath) {
      return reply.code(400).send({ error: 'Job not ready for download' });
    }

    const filePath = job.outputPath;
    if (!fs.existsSync(filePath)) {
      return reply.code(404).send({ error: 'Output file not found' });
    }

    const filename = job.displayFilename || path.basename(filePath);
    const stat = fs.statSync(filePath);

    reply.raw.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': stat.size,
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(reply.raw);

    reply.hijack();          // tell Fastify we took over the response

    // Clean up after the response is sent
    reply.raw.on('finish', () => {
      try {
        fs.unlinkSync(filePath);
      } catch { /* file may already be gone */ }
      deleteJob(id);
    });
  });
}
