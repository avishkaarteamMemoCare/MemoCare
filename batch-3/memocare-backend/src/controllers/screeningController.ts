import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as screeningService from '../services/screeningService';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/errors';
import { recordAuditLog } from '../services/auditService';

export const listTests = asyncHandler(async (_req: Request, res: Response) => {
  const tests = await screeningService.listActiveTests();
  res.status(200).json({ data: tests });
});

// "Mind games" catalog — a friendlier subset view of the same tests
// (Orientation, Word Recall, Name-the-Objects/"Guess the Thing", and
// Pattern Memory). Taking one still goes through the normal
// /screening-tests/{id} and /patients/{id}/screening-attempts endpoints.
export const listGames = asyncHandler(async (_req: Request, res: Response) => {
  const games = await screeningService.listGameTests();
  res.status(200).json({ data: games });
});

export const getTest = asyncHandler(async (req: Request, res: Response) => {
  const test = await screeningService.getTestForTaking(req.params.testId);
  res.status(200).json({ data: test });
});

export const listAllTestsForAdmin = asyncHandler(async (_req: Request, res: Response) => {
  const tests = await screeningService.listAllTestsForAdmin();
  res.status(200).json({ data: tests.map((t) => ({ ...t, itemCount: t._count.items })) });
});

export const createTest = asyncHandler(async (req: Request, res: Response) => {
  const { items, ...rest } = req.body;
  if (rest.itemsPerAttempt != null && rest.itemsPerAttempt > items.length) {
    throw AppError.badRequest('itemsPerAttempt cannot be larger than the number of items in the test.');
  }
  const test = await prisma.screeningTest.create({
    data: { ...rest, items: { create: items } },
    include: { items: true },
  });
  res.status(201).json({ data: test });
});

export const setTestActive = asyncHandler(async (req: Request, res: Response) => {
  const test = await screeningService.setTestActive(req.params.testId, req.body.isActive);
  res.status(200).json({ data: test });
});

export const submitAttempt = asyncHandler(async (req: Request, res: Response) => {
  const attempt = await screeningService.submitAttempt(
    req.params.patientId,
    req.body.testId,
    req.auth!.userId,
    req.body.answers
  );
  res.status(201).json({ data: attempt });
});

export const listAttemptsForPatient = asyncHandler(async (req: Request, res: Response) => {
  const attempts = await screeningService.listAttemptsForPatient(req.params.patientId);
  await recordAuditLog({
    actorId: req.auth!.userId,
    patientId: req.params.patientId,
    action: 'VIEW_SCREENING_RESULT',
    resourceType: 'ScreeningAttempt',
  });
  res.status(200).json({ data: attempts });
});

export const deleteAttempt = asyncHandler(async (req: Request, res: Response) => {
  await screeningService.deleteAttempt(req.params.patientId, req.params.attemptId);
  res.status(204).send();
});

export const deleteAllAttempts = asyncHandler(async (req: Request, res: Response) => {
  const result = await screeningService.deleteAllAttempts(req.params.patientId);
  res.status(200).json({ data: result });
});

/**
 * Match the Tiles result. The game runs in the browser, but the score is
 * computed and stored here so it lands in the patient's score history (and
 * can be deleted with it). Access mirrors requirePatientAccess.
 */
export const recordMatchTiles = asyncHandler(async (req: Request, res: Response) => {
  const patientId = String(req.body.patientId || '');
  if (!patientId) throw AppError.badRequest('patientId is required');

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { hospitalId: true, assignedDoctorId: true },
  });
  if (!patient) throw AppError.notFound('Patient not found');

  if (req.auth!.role === 'HOSPITAL_STAFF') {
    if (patient.hospitalId !== req.auth!.hospitalId || patient.assignedDoctorId !== req.auth!.userId) {
      throw AppError.forbidden('This patient is not assigned to you');
    }
  } else if (req.auth!.role === 'FAMILY' || req.auth!.role === 'CARETAKER') {
    const link = await prisma.patientLink.findUnique({
      where: { patientId_userId: { patientId, userId: req.auth!.userId } },
    });
    if (!link) throw AppError.forbidden('You are not linked to this patient');
  } else if (req.auth!.role !== 'ADMIN') {
    throw AppError.forbidden('Games are played on behalf of a patient');
  }

  const attempt = await screeningService.recordMatchTilesResult(patientId, req.auth!.userId, req.body);
  res.status(201).json({ data: attempt });
});

export const getAttempt = asyncHandler(async (req: Request, res: Response) => {
  const attempt = await screeningService.getAttempt(req.params.attemptId);
  res.status(200).json({ data: attempt });
});
