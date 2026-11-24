import { Job, Worker } from 'bullmq';
import { redisConnection } from '../config/redis';
import { logger } from '../config/logger';
import { SPEECH_ANALYSIS_QUEUE, SpeechAnalysisJobData } from './queues';
import { analyzeMediaSessionSafely } from '../services/speechAnalysisPipeline';

/** Runs the shared speech-analysis pipeline for one queued recording. */
async function processJob(job: Job<SpeechAnalysisJobData>) {
  await analyzeMediaSessionSafely(job.data.mediaSessionId, job.data.patientId);
}

export const speechAnalysisWorker = new Worker<SpeechAnalysisJobData>(
  SPEECH_ANALYSIS_QUEUE,
  async (job) => {
    // The pipeline marks the session FAILED, then we rethrow so BullMQ retries.
    await processJob(job);
  },
  { connection: redisConnection, concurrency: 4 }
);

speechAnalysisWorker.on('completed', (job) => {
  logger.info({ jobId: job.id, mediaSessionId: job.data.mediaSessionId }, 'Speech analysis job completed');
});

speechAnalysisWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Speech analysis job failed');
});
