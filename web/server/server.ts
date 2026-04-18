import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import path from 'path';

import { healthRoutes } from './routes/health';
import { convertRoutes } from './routes/convert';
import { summarizeRoutes } from './routes/summarize';
import { jobRoutes } from './routes/jobs';
import { imageRoutes } from './routes/images';
import { mergeRoutes } from './routes/merge';

const PORT = parseInt(process.env.PORT ?? '3000', 10);

const app = Fastify({ logger: true, bodyLimit: 100 * 1024 * 1024 }); // 100MB for merge payloads

async function start(): Promise<void> {
  // CORS — allow any origin in dev
  await app.register(fastifyCors, { origin: true });

  // Multipart support for file uploads
  await app.register(fastifyMultipart, {
    limits: {
      fileSize: 20 * 1024 * 1024, // 20MB per file
      files: 50, // max 50 files
    },
  });

  // Serve the frontend static files
  // Compiled JS runs from dist/web/server/ — resolve to repo root, then web/frontend
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const frontendDir = path.resolve(repoRoot, 'web', 'frontend');
  await app.register(fastifyStatic, {
    root: frontendDir,
    prefix: '/',
  });

  // Register routes
  await app.register(healthRoutes);
  await app.register(convertRoutes);
  await app.register(summarizeRoutes);
  await app.register(jobRoutes);
  await app.register(imageRoutes);
  await app.register(mergeRoutes);

  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`🚀 SiteToPdf API server listening on http://0.0.0.0:${PORT}`);
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
