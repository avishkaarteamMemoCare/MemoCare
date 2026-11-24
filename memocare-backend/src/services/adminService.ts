import crypto from 'crypto';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/errors';
import { hashPassword } from '../utils/password';
import { env } from '../config/env';
import { sendEmail, emailTemplates } from './emailService';

export async function createHospital(name: string, address?: string) {
  const inviteCode = crypto.randomBytes(6).toString('hex').toUpperCase();
  return prisma.hospital.create({ data: { name, address, inviteCode, isApproved: true } });
}

export async function listHospitals() {
  return prisma.hospital.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function getHospital(hospitalId: string) {
  const hospital = await prisma.hospital.findUnique({ where: { id: hospitalId } });
  if (!hospital) throw AppError.notFound('Hospital not found');
  return hospital;
}

export async function updateHospital(hospitalId: string, input: { name?: string; address?: string }) {
  return prisma.hospital.update({ where: { id: hospitalId }, data: input });
}

export async function rotateHospitalInviteCode(hospitalId: string) {
  const inviteCode = crypto.randomBytes(6).toString('hex').toUpperCase();
  return prisma.hospital.update({ where: { id: hospitalId }, data: { inviteCode } });
}

export async function listPendingStaff() {
  return prisma.user.findMany({
    where: { role: 'HOSPITAL_STAFF', status: 'PENDING_APPROVAL' },
    include: { hospital: true },
    orderBy: { createdAt: 'asc' },
  });
}

export async function approveStaff(userId: string, staffTitle: 'DOCTOR' | 'NURSE' | 'CLINICIAN' | 'ADMIN_STAFF') {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw AppError.notFound('User not found');
  if (user.role !== 'HOSPITAL_STAFF') throw AppError.badRequest('User is not a hospital staff account');
  if (user.status !== 'PENDING_APPROVAL') throw AppError.conflict('User is not pending approval');

  return prisma.user.update({ where: { id: userId }, data: { status: 'ACTIVE', staffTitle } });
}

export async function rejectStaff(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw AppError.notFound('User not found');
  return prisma.user.update({ where: { id: userId }, data: { status: 'REJECTED' } });
}

/**
 * Hospital management can only suspend doctor accounts. Family members,
 * caretakers and medical stores are never suspended from this console.
 */
async function assertSuspendable(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user) throw AppError.notFound('User not found');
  if (user.role !== 'HOSPITAL_STAFF') {
    throw AppError.forbidden('Hospital management can only suspend doctor accounts.');
  }
  return user;
}

export async function suspendUser(userId: string) {
  await assertSuspendable(userId);
  return prisma.user.update({ where: { id: userId }, data: { status: 'SUSPENDED' } });
}

export async function reactivateUser(userId: string) {
  await assertSuspendable(userId);
  return prisma.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } });
}

// The management console's Users tab is a roster of the doctors under this
// admin. Family members, caretakers, stores, nurses and other staff are not
// listed here.
export async function listUsers(filters: { role?: string; status?: string }) {
  return prisma.user.findMany({
    where: {
      role: 'HOSPITAL_STAFF',
      staffTitle: 'DOCTOR',
      status: filters.status as any,
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      status: true,
      staffTitle: true,
      hospitalId: true,
      hospital: { select: { name: true } },
      createdAt: true,
      emailVerifiedAt: true,
    },
    take: 200,
  });
}

/**
 * Creates a hospital staff login that is active immediately — the direct
 * alternative to the invite-code signup + approval flow. A welcome email with
 * the temporary password is sent when SMTP is configured; otherwise the admin
 * can read the credentials back from the response and share them.
 */
export async function createStaffAccount(
  input: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    staffTitle: 'DOCTOR' | 'NURSE' | 'CLINICIAN' | 'ADMIN_STAFF';
    hospitalId?: string;
  },
  createdById: string
) {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw AppError.conflict('An account with this email already exists');

  const hospital = input.hospitalId
    ? await prisma.hospital.findUnique({ where: { id: input.hospitalId } })
    : await prisma.hospital.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!hospital) {
    throw AppError.badRequest('Create a hospital first, then add staff to it.');
  }

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: 'HOSPITAL_STAFF',
      status: 'ACTIVE',
      staffTitle: input.staffTitle,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      hospitalId: hospital.id,
      emailVerifiedAt: new Date(),
      hospitalInviteCodeUsed: 'created-by-admin',
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      status: true,
      staffTitle: true,
      hospitalId: true,
      createdAt: true,
    },
  });

  const tmpl = emailTemplates.staffWelcome({
    name: `${user.firstName} ${user.lastName}`,
    email,
    password: input.password,
    staffTitle: input.staffTitle,
    hospitalName: hospital.name,
    loginUrl: `${env.clientUrl}/login`,
  });

  let emailSent = false;
  let emailError: string | undefined;
  try {
    await sendEmail({
      to: email,
      subject: tmpl.subject,
      html: tmpl.html,
      text: tmpl.text,
      tag: 'staff-welcome',
      sentById: createdById,
    });
    emailSent = true;
  } catch (err: any) {
    emailError = err?.message ?? String(err);
  }

  return { user, emailSent, emailError, hospitalName: hospital.name };
}
