import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { prisma } from './config/prisma';

const app = createApp();

const server = app.listen(env.port, () => {
  logger.info(`MemoCare API listening on port ${env.port} [${env.nodeEnv}]`);
  logger.info(`Swagger docs available at ${env.appUrl}/api/docs`);
});

// Start the queue workers in-process unless a dedicated worker service runs
// them (INLINE_WORKERS=false). Without this, uploaded recordings sit at
// "Queued" forever because nothing consumes the BullMQ job.
if (!env.isTest && env.inlineWorkers) {
  // Import after the HTTP server is listening so worker logs appear in order.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('./jobs/worker');
}

async function shutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  // Force-exit if graceful shutdown hangs.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
