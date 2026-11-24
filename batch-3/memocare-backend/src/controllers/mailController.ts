import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as mailService from '../services/mailService';
import { sendTestEmail } from '../services/emailService';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/errors';

export const getSettings = asyncHandler(async (_req: Request, res: Response) => {
  res.status(200).json({ data: await mailService.mailStatus() });
});

export const saveSettings = asyncHandler(async (req: Request, res: Response) => {
  const result = await mailService.saveMailSettings(req.body, req.auth!.userId);
  res.status(200).json({ data: result });
});

export const testConnection = asyncHandler(async (req: Request, res: Response) => {
  const result = await mailService.testMailConnection(req.body);
  res.status(200).json({ data: result });
});

export const sendTest = asyncHandler(async (req: Request, res: Response) => {
  let to = req.body?.to as string | undefined;
  if (!to) {
    const user = await prisma.user.findUnique({
      where: { id: req.auth!.userId },
      select: { email: true },
    });
    to = user?.email;
  }
  if (!to) throw AppError.badRequest('No recipient address available');

  const result = await sendTestEmail(to);
  res.status(200).json({ data: { sent: true, to, id: result.id } });
});

export const listRecipients = asyncHandler(async (_req: Request, res: Response) => {
  res.status(200).json({ data: await mailService.listMailRecipients() });
});

export const sendMail = asyncHandler(async (req: Request, res: Response) => {
  const admin = await prisma.user.findUnique({
    where: { id: req.auth!.userId },
    select: { firstName: true, lastName: true },
  });
  const senderName = admin ? `${admin.firstName} ${admin.lastName}`.trim() : 'Hospital management';
  const result = await mailService.sendAdminMail(req.body, {
    id: req.auth!.userId,
    name: senderName,
  });
  res.status(200).json({ data: result });
});

export const myInbox = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({ data: await mailService.listInboxForUser(req.auth!.userId) });
});

export const listAdmins = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({ data: await mailService.listAdminsForUser({ hospitalId: req.auth!.hospitalId }) });
});

export const contactAdmin = asyncHandler(async (req: Request, res: Response) => {
  const sender = await prisma.user.findUnique({
    where: { id: req.auth!.userId },
    select: { firstName: true, lastName: true, role: true, hospitalId: true },
  });
  const result = await mailService.sendUserMessageToAdmin(req.body, {
    id: req.auth!.userId,
    name: sender ? `${sender.firstName} ${sender.lastName}`.trim() : 'MemoCare user',
    role: sender?.role ?? req.auth!.role,
    hospitalId: sender?.hospitalId ?? req.auth!.hospitalId,
  });
  res.status(200).json({ data: result });
});

export const deleteInboxMail = asyncHandler(async (req: Request, res: Response) => {
  await mailService.deleteInboxMail(req.auth!.userId, req.params.mailId);
  res.status(204).send();
});

export const deleteSentMail = asyncHandler(async (req: Request, res: Response) => {
  await mailService.deleteSentMail(req.params.mailId);
  res.status(204).send();
});

export const sentHistory = asyncHandler(async (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 100;
  res.status(200).json({ data: await mailService.listSentMail(Number.isFinite(limit) ? limit : 100) });
});
