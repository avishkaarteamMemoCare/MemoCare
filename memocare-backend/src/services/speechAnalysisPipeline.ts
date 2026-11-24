import { prisma } from '../config/prisma';
import { logger } from '../config/logger';
import { featureExtractor, mlRiskService } from './mlRiskService';
import { notifyRiskAlertIfNeeded } from './notificationService';

/**
 * The full pipeline for a single media session:
 *   1. Mark session PROCESSING
 *   2. Extract acoustic/linguistic features (pauses, rate, fillers, coherence)
 *   3. Run the pluggable ML risk-scoring service on those features
 *   4. Persist a SpeechAnalysisResult row
 *   5. Mark session COMPLETED
 *   6. Fire a risk-alert notification if the score crosses a threshold
 *
 * Lives in its own module (not in the worker file) so the API can run the
 * same work in-process when the Redis queue is unavailable.
 */
export async function analyzeMediaSession(mediaSessionId: string, patientId: string): Promise<boolean> {
  const session = await prisma.mediaSession.findUnique({ where: { id: mediaSessionId } });
  // The recording can be deleted while its analysis is still queued; there is
  // then nothing left to analyse, so skip it instead of failing/retrying.
  if (!session) {
    logger.info({ mediaSessionId }, 'Skipping speech analysis: recording no longer exists');
    return false;
  }

  await prisma.mediaSession.update({ where: { id: mediaSessionId }, data: { status: 'PROCESSING' } });

  const features = await featureExtractor.extract(session.storageKey);
  const risk = await mlRiskService.score(features);

  await prisma.$transaction([
    prisma.speechAnalysisResult.upsert({
      where: { mediaSessionId },
      update: {
        ...features,
        transcriptText: features.transcriptText ?? null,
        rawFeatureJson: features.rawFeatureJson as any,
        riskScore: risk.riskScore,
        riskLevel: risk.riskLevel,
        modelVersion: risk.modelVersion,
        modelRawResponse: risk.modelRawResponse as any,
        analyzedAt: new Date(),
      },
      create: {
        mediaSessionId,
        patientId,
        ...features,
        transcriptText: features.transcriptText ?? null,
        rawFeatureJson: features.rawFeatureJson as any,
        riskScore: risk.riskScore,
        riskLevel: risk.riskLevel,
        modelVersion: risk.modelVersion,
        modelRawResponse: risk.modelRawResponse as any,
        analyzedAt: new Date(),
      },
    }),
    prisma.mediaSession.update({ where: { id: mediaSessionId }, data: { status: 'COMPLETED' } }),
  ]);

  await notifyRiskAlertIfNeeded(patientId, risk.riskLevel, risk.riskScore);
  return true;
}

/** Runs the pipeline and records a FAILED session (with reason) on any error. */
export async function analyzeMediaSessionSafely(mediaSessionId: string, patientId: string): Promise<void> {
  try {
    await analyzeMediaSession(mediaSessionId, patientId);
  } catch (err) {
    await prisma.mediaSession
      .update({
        where: { id: mediaSessionId },
        data: { status: 'FAILED', failureReason: err instanceof Error ? err.message : 'Unknown error' },
      })
      .catch(() => undefined);
    throw err;
  }
}
