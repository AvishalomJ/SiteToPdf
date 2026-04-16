import { FastifyInstance } from 'fastify';

const startTime = Date.now();

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    return {
      status: 'healthy',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      version: '0.5.0',
    };
  });
}
