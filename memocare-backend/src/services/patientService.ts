import { PatientLinkRole } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/errors';
import { encryptField, decryptField } from '../utils/encryption';
import { patientVisibilityWhere } from '../middleware/rbac';
import { generateRandomToken } from '../utils/tokens';
import { sendEmail, emailTemplates } from './emailService';
import * as notificationService from './notificationService';
import { env } from '../config/env';

export interface CreatePatientInput {
  firstName: string;
  lastName: string;
  dateOfBirth: string; // ISO date
  sex?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  phone?: string;
  address?: string;
  relatives?: Array<{ name: string; phone?: string; relationship?: string }>;
  medicalHistoryNotes?: string;
  diagnosisStatus?: string;
  hospitalId?: string; // set automatically for hospital staff
  assignedDoctorId?: string; // hospital staff only: assign to a specific doctor
}

function serializePatient(patient: any) {
  let notes: string | null = null;
  try {
    notes = decryptField(patient.medicalHistoryNotes);
  } catch {
    // Encrypted with a different FIELD_ENCRYPTION_KEY (e.g. the key was
    // rotated/regenerated). Never let one bad field take down the whole
    // patient list — surface a marker instead.
    notes = patient.medicalHistoryNotes ? '[unable to decrypt — encryption key changed]' : null;
  }
  return {
    ...patient,
    medicalHistoryNotes: notes,
  };
}

/** Include the hospital name + the most recent speech-analysis risk level so
 *  dashboards can render them without extra round trips. */
const PATIENT_LIST_INCLUDE = {
  hospital: { select: { id: true, name: true } },
  assignedDoctor: { select: { id: true, firstName: true, lastName: true, staffTitle: true } },
} as const;

async function attachLatestRisk(patients: any[]): Promise<any[]> {
  if (!patients.length) return patients;
  const patientIds = patients.map((p) => p.id);
  const latest = await prisma.speechAnalysisResult.findMany({
    where: { patientId: { in: patientIds }, analyzedAt: { not: null } },
    orderBy: { analyzedAt: 'desc' },
    select: { patientId: true, riskLevel: true },
  });
  const byPatient: Record<string, string> = {};
  for (const r of latest) {
    if (!byPatient[r.patientId]) byPatient[r.patientId] = r.riskLevel;
  }
  return patients.map((p) => ({ ...p, latestRiskLevel: byPatient[p.id] ?? 'UNKNOWN' }));
}

export async function createPatient(
  input: CreatePatientInput,
  createdBy: { userId: string; role: string; hospitalId?: string | null }
) {
  let hospitalId: string | undefined;
  let assignedDoctorId: string | undefined;
  if (createdBy.role === 'HOSPITAL_STAFF') {
    if (!createdBy.hospitalId) throw AppError.badRequest('Hospital staff account is not linked to a hospital');
    hospitalId = createdBy.hospitalId;
    // Doctors only see patients assigned to them, so a patient they register
    // is assigned to them automatically (management can reassign later).
    assignedDoctorId = createdBy.userId;
  }

  if (createdBy.role === 'ADMIN' && input.assignedDoctorId) {
    const doctor = await prisma.user.findUnique({ where: { id: input.assignedDoctorId } });
    if (!doctor || doctor.role !== 'HOSPITAL_STAFF' || (createdBy.hospitalId && doctor.hospitalId !== createdBy.hospitalId)) {
      throw AppError.badRequest('assignedDoctorId must be hospital staff in the management hospital');
    }
    assignedDoctorId = doctor.id;
    hospitalId = createdBy.hospitalId ?? doctor.hospitalId ?? undefined;
  }

  const patient = await prisma.patient.create({
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      dateOfBirth: new Date(input.dateOfBirth),
      sex: input.sex,
      emergencyContactName: input.emergencyContactName,
      emergencyContactPhone: input.emergencyContactPhone,
      phone: input.phone,
      address: input.address,
      relatives: input.relatives as any,
      medicalHistoryNotes: input.medicalHistoryNotes ? encryptField(input.medicalHistoryNotes) : undefined,
      diagnosisStatus: input.diagnosisStatus,
      hospitalId,
      assignedDoctorId,
      createdById: createdBy.userId,
    },
    include: { assignedDoctor: { select: { id: true, firstName: true, lastName: true, staffTitle: true } } },
  });

  // Non-staff creators (family/caretaker) are auto-linked to the patient
  // they just created so they retain access to it.
  if (createdBy.role === 'FAMILY' || createdBy.role === 'CARETAKER') {
    await prisma.patientLink.create({
      data: {
        patientId: patient.id,
        userId: createdBy.userId,
        linkRole: createdBy.role === 'FAMILY' ? 'FAMILY_MEMBER' : 'CARETAKER',
      },
    });
  }

  return serializePatient(patient);
}

export async function getPatientById(patientId: string) {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: {
      hospital: { select: { id: true, name: true } },
      assignedDoctor: { select: { id: true, firstName: true, lastName: true, staffTitle: true } },
    },
  });
  if (!patient) throw AppError.notFound('Patient not found');
  // The workspace header and "Current status" badge read latestRiskLevel from
  // this endpoint, so it must carry the same most-recent speech-analysis risk
  // the patient list does (otherwise an assessed patient shows
  // "Not yet assessed").
  const [withRisk] = await attachLatestRisk([patient]);
  return serializePatient(withRisk);
}

export async function listPatientsForUser(
  auth: { userId: string; role: string; hospitalId?: string | null },
  options: { includeDismissed?: boolean; dismissedOnly?: boolean } = {}
) {
  const where = patientVisibilityWhere(auth as any);

  // BUG FIX: hospital staff previously only saw patients where they were the
  // assigned attending doctor (assignedDoctorId === their own user id). That
  // meant patients they *registered* (but did not assign to themselves)
  // silently vanished from their dashboard while hospital management could
  // still see them. Staff may see every patient of their hospital.
  const statusFilter = options.dismissedOnly
    ? { status: 'DISMISSED' as const }
    : options.includeDismissed
      ? {}
      : { status: 'ACTIVE' as const };

  const patients = await prisma.patient.findMany({
    where: { ...where, ...statusFilter },
    orderBy: { createdAt: 'desc' },
    include: PATIENT_LIST_INCLUDE,
  });
  const withRisk = await attachLatestRisk(patients);
  return withRisk.map(serializePatient);
}

/** Dismiss (discharge/archive) a patient — clinical staff only. The record is
 *  kept and moved to the dismissed archive instead of being deleted. */
export async function dismissPatient(
  patientId: string,
  auth: { userId: string; role: string; hospitalId?: string | null },
  reason?: string
) {
  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) throw AppError.notFound('Patient not found');
  if (auth.role === 'HOSPITAL_STAFF') {
    if (!auth.hospitalId || patient.hospitalId !== auth.hospitalId || patient.assignedDoctorId !== auth.userId) {
      throw AppError.forbidden('You can only dismiss patients assigned to you');
    }
  }
  if (patient.status === 'DISMISSED') throw AppError.badRequest('Patient is already dismissed');
  const updated = await prisma.patient.update({
    where: { id: patientId },
    data: { status: 'DISMISSED', dismissedAt: new Date(), dismissReason: reason ?? null },
    include: PATIENT_LIST_INCLUDE,
  });
  const [withRisk] = await attachLatestRisk([updated]);
  return serializePatient(withRisk);
}

/** Bring a dismissed patient back into the active list. */
export async function readmitPatient(
  patientId: string,
  auth: { userId: string; role: string; hospitalId?: string | null }
) {
  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) throw AppError.notFound('Patient not found');
  if (auth.role === 'HOSPITAL_STAFF') {
    if (!auth.hospitalId || patient.hospitalId !== auth.hospitalId || patient.assignedDoctorId !== auth.userId) {
      throw AppError.forbidden('You can only readmit patients assigned to you');
    }
  }
  if (patient.status !== 'DISMISSED') throw AppError.badRequest('Patient is not dismissed');
  const updated = await prisma.patient.update({
    where: { id: patientId },
    data: { status: 'ACTIVE', dismissedAt: null, dismissReason: null },
    include: PATIENT_LIST_INCLUDE,
  });
  const [withRisk] = await attachLatestRisk([updated]);
  return serializePatient(withRisk);
}

/** Full archive view of every dismissed patient: registration info, screening
 *  results, speech-analysis risk results, links, and join/dismiss dates. */
export async function listDismissedPatients(auth: { userId: string; role: string; hospitalId?: string | null }) {
  const where = auth.role === 'HOSPITAL_STAFF'
    ? { hospitalId: auth.hospitalId ?? '__none__', assignedDoctorId: auth.userId, status: 'DISMISSED' as const }
    : { status: 'DISMISSED' as const }; // ADMIN sees everything

  const patients = await prisma.patient.findMany({
    where,
    orderBy: { dismissedAt: 'desc' },
    include: {
      ...PATIENT_LIST_INCLUDE,
      createdBy: { select: { id: true, firstName: true, lastName: true, role: true } },
      links: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } } } },
      screeningAttempts: {
        include: { test: { select: { id: true, title: true, testType: true } } },
        orderBy: { startedAt: 'desc' },
      },
      mediaSessions: {
        where: { analysisResult: { isNot: null } },
        include: {
          analysisResult: {
            select: { riskScore: true, riskLevel: true, analyzedAt: true, speechRateWpm: true, coherenceScore: true, pauseCount: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  return patients.map((p: any) => ({
    ...serializePatient(p),
    latestRiskLevel: p.mediaSessions?.[0]?.analysisResult?.riskLevel ?? 'UNKNOWN',
    mediaSessions: p.mediaSessions.map((m: any) => ({
      id: m.id,
      assessmentTag: m.assessmentTag,
      createdAt: m.createdAt,
      riskScore: m.analysisResult?.riskScore,
      riskLevel: m.analysisResult?.riskLevel,
      analyzedAt: m.analysisResult?.analyzedAt,
      speechRateWpm: m.analysisResult?.speechRateWpm,
      coherenceScore: m.analysisResult?.coherenceScore,
      pauseCount: m.analysisResult?.pauseCount,
    })),
  }));
}

/**
 * Permanently deletes a patient together with their whole history: media
 * sessions and speech results, screening/game attempts and answers, notes,
 * appointments, medications and logs, location history, documents, family
 * photos and quizzes, links/invites and audit rows. Access is enforced by the
 * route (management, or the doctor the patient is assigned to).
 */
export async function deletePatient(patientId: string) {
  const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { id: true } });
  if (!patient) throw AppError.notFound('Patient not found');

  // AuditLog has no cascading relation to Patient, and PatientLinkInvite has
  // no relation at all, so those two are cleared explicitly first. Everything
  // else (links, media + speech results, screening attempts + answers, notes,
  // appointments, progress, medications + logs, location, documents, family
  // photos + quiz answers) cascades from the patient row.
  await prisma.$transaction([
    prisma.patientLinkInvite.deleteMany({ where: { patientId } }),
    prisma.auditLog.deleteMany({ where: { patientId } }),
    prisma.patient.delete({ where: { id: patientId } }),
  ]);

  return { id: patientId, deleted: true };
}

export async function listStaffOptions(hospitalId: string) {
  const staff = await prisma.user.findMany({
    where: { hospitalId, role: 'HOSPITAL_STAFF', status: 'ACTIVE' },
    select: { id: true, firstName: true, lastName: true, staffTitle: true },
    orderBy: { firstName: 'asc' },
  });
  return staff;
}

export async function updatePatient(patientId: string, input: Partial<CreatePatientInput>) {
  const data: Record<string, unknown> = { ...input };
  if (input.dateOfBirth) data.dateOfBirth = new Date(input.dateOfBirth);
  if (input.medicalHistoryNotes !== undefined) {
    data.medicalHistoryNotes = input.medicalHistoryNotes ? encryptField(input.medicalHistoryNotes) : null;
  }
  delete (data as any).hospitalId; // hospital assignment is not editable via generic update
  delete (data as any).assignedDoctorId; // use the management-only assignment endpoint
  const patient = await prisma.patient.update({
    where: { id: patientId },
    data,
    include: { assignedDoctor: { select: { id: true, firstName: true, lastName: true, staffTitle: true } } },
  });
  const [withRisk] = await attachLatestRisk([patient]);
  return serializePatient(withRisk);
}

export async function assignDoctor(patientId: string, doctorId: string, hospitalId?: string | null) {
  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  const doctor = await prisma.user.findUnique({ where: { id: doctorId } });
  if (!patient || !doctor) throw AppError.notFound('Patient or doctor not found');
  if (doctor.role !== 'HOSPITAL_STAFF' || doctor.status !== 'ACTIVE' || (hospitalId && doctor.hospitalId !== hospitalId) || (patient.hospitalId && doctor.hospitalId !== patient.hospitalId)) {
    throw AppError.badRequest('Doctor must be an active member of the patient hospital');
  }
  return prisma.patient.update({ where: { id: patientId }, data: { assignedDoctorId: doctorId }, include: { assignedDoctor: { select: { id: true, firstName: true, lastName: true, staffTitle: true } } } });
}

export async function listLinksForPatient(patientId: string) {
  return prisma.patientLink.findMany({
    where: { patientId },
    include: { user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } } },
  });
}

export async function unlinkUser(patientId: string, userId: string) {
  const link = await prisma.patientLink.findUnique({ where: { patientId_userId: { patientId, userId } } });
  if (!link) throw AppError.notFound('Link not found');
  await prisma.patientLink.delete({ where: { id: link.id } });
}

/**
 * Directly link an existing user (used when the invited person already
 * has an account) or, if no user exists with that email yet, create a
 * pending PatientLinkInvite and email them a signup/accept link.
 */
export async function inviteUserToPatient(
  patientId: string,
  email: string,
  linkRole: PatientLinkRole,
  invitedById: string,
  inviterName: string
) {
  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) throw AppError.notFound('Patient not found');

  const existingUser = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  const patientName = `${patient.firstName} ${patient.lastName}`;

  if (existingUser) {
    const alreadyLinked = await prisma.patientLink.findUnique({
      where: { patientId_userId: { patientId, userId: existingUser.id } },
    });
    if (alreadyLinked) return { status: 'already_linked' as const, link: alreadyLinked };

    // The account already exists, so nothing is shared yet: the invite appears
    // in that person's Notifications tab and access starts when they accept.
    await prisma.patientLinkInvite.deleteMany({
      where: { patientId, email: existingUser.email.toLowerCase(), acceptedAt: null },
    });
    const inviteToken = generateRandomToken();
    const invite = await prisma.patientLinkInvite.create({
      data: {
        patientId,
        email: existingUser.email.toLowerCase(),
        linkRole,
        token: inviteToken,
        invitedById,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      },
    });
    await notificationService.notifyPatientInvite(existingUser.id, {
      inviterName,
      patientName,
      patientId,
      token: inviteToken,
      linkRole,
    });
    return { status: 'invited' as const, invite };
  }

  const token = generateRandomToken();
  const invite = await prisma.patientLinkInvite.create({
    data: {
      patientId,
      email: email.toLowerCase(),
      linkRole,
      token,
      invitedById,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    },
  });

  const acceptUrl = `${env.clientUrl}/accept-invite?token=${token}`;
  const tmpl = emailTemplates.patientLinkInvite(inviterName, `${patient.firstName} ${patient.lastName}`, acceptUrl);
  await sendEmail({ to: email, subject: tmpl.subject, html: tmpl.html });

  return { status: 'invited' as const, invite };
}

export async function declinePatientLinkInvite(token: string, userId: string) {
  const invite = await prisma.patientLinkInvite.findUnique({ where: { token } });
  if (!invite || invite.acceptedAt) throw AppError.badRequest('Invite is no longer available');
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user || user.email.toLowerCase() !== invite.email.toLowerCase()) {
    throw AppError.forbidden('This invite was not sent to your account');
  }
  await prisma.patientLinkInvite.delete({ where: { id: invite.id } });
  return { patientId: invite.patientId };
}

export async function acceptPatientLinkInvite(token: string, userId: string) {
  const invite = await prisma.patientLinkInvite.findUnique({ where: { token } });
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    throw AppError.badRequest('Invite is invalid or has expired');
  }
  await prisma.$transaction([
    prisma.patientLinkInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
    prisma.patientLink.upsert({
      where: { patientId_userId: { patientId: invite.patientId, userId } },
      update: { linkRole: invite.linkRole },
      create: { patientId: invite.patientId, userId, linkRole: invite.linkRole },
    }),
  ]);
  return { patientId: invite.patientId };
}
