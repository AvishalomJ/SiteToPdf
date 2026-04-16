import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import path from 'path';

import { healthRoutes } from './routes/health';
import { convertRoutes } from './routes/convert';
import { summarizeRoutes } from './routes/summarize';
import { jobRoutes } from './routes/jobs';

const PORT = parseInt(process.env.PORT ?? '3000', 10);

const app = Fastify({ logger: true });

async function start(): Promise<void> {
  // CORS — allow any origin in dev
  await app.register(fastifyCors, { origin: true });

  // Serve the frontend static files
  await app.register(fastifyStatic, {
    root: path.resolve(__dirname, '..', '..', 'frontend'),
    prefix: '/',
  });

  // Register routes
  await app.register(healthRoutes);
  await app.register(convertRoutes);
  await app.register(summarizeRoutes);
  await app.register(jobRoutes);

  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`🚀 SiteToPdf API server listening on http://0.0.0.0:${PORT}`);
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
