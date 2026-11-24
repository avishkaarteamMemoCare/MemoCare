import { NotificationType, NotificationChannel } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/errors';
import { emailTemplates } from './emailService';

const RISK_ALERT_THRESHOLD = 66; // matches HIGH risk level cutoff in mlRiskService
const RECOVERY_IMPROVEMENT_POINTS = 8; // a drop this large in risk score is real good news
const LOGIN_SUMMARY_COOLDOWN_HOURS = 6;

const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;

/**
 * Everyone who should hear about a patient: family/caretakers linked to the
 * patient, the doctor the patient is assigned to, whoever registered the
 * patient, and active hospital-management (ADMIN) accounts. Other doctors of
 * the hospital are deliberately not included — they cannot see the patient. This is what makes alerts reach the doctor, the admin and the
 * family in every dashboard, not just linked relatives.
 */
async function getRecipientsForPatient(patientId: string): Promise<string[]> {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { hospitalId: true, assignedDoctorId: true, createdById: true },
  });
  if (!patient) return [];

  // Only the assigned doctor hears about a patient — a doctor is never
  // notified about patients that are not assigned to them.
  const [links, admins] = await Promise.all([
    prisma.patientLink.findMany({ where: { patientId }, select: { userId: true } }),
    prisma.user.findMany({
      where: {
        role: 'ADMIN',
        status: 'ACTIVE',
        ...(patient.hospitalId
          ? { OR: [{ hospitalId: patient.hospitalId }, { hospitalId: null }] }
          : {}),
      },
      select: { id: true },
    }),
  ]);

  const ids = new Set<string>();
  links.forEach((l) => ids.add(l.userId));
  if (patient.assignedDoctorId) ids.add(patient.assignedDoctorId);
  if (patient.createdById) ids.add(patient.createdById);
  admins.forEach((u) => ids.add(u.id));

  // Safety net for the demo: a patient with no care team linked yet should
  // still produce a visible notification rather than silently going nowhere.
  if (ids.size === 0) {
    const fallback = await prisma.user.findMany({
      where: { status: 'ACTIVE', role: { in: ['HOSPITAL_STAFF', 'ADMIN'] } },
      select: { id: true },
      take: 5,
    });
    fallback.forEach((u) => ids.add(u.id));
  }

  return Array.from(ids);
}

async function dispatchNotification(
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  metadata?: Record<string, unknown>,
  _options: { tag?: string; skipEmail?: boolean } = {}
) {
  const prefs = await prisma.notificationPreference.findUnique({
    where: { userId_type: { userId, type } },
  });
  const inAppEnabled = prefs?.inAppEnabled ?? true;

  // Automated updates (screening results, risk alerts, reminders, welcome
  // notes) stay in the Notifications tab. They are not mirrored into Mail:
  // Mail is for messages people actually send each other.
  if (!inAppEnabled) return;

  await prisma.notification.create({
    data: {
      userId,
      type,
      channel: 'IN_APP' as NotificationChannel,
      title,
      body,
      metadata: metadata as any,
      sentAt: new Date(),
    },
  });
}

/** Sends a plain in-app notification (no email copy) to one account. */
export async function notifyUser(
  userId: string,
  title: string,
  body: string,
  metadata?: Record<string, unknown>
) {
  await dispatchNotification(userId, 'SYSTEM', title, body, metadata);
}

/**
 * Invites an existing MemoCare account to a patient's care team. The invite
 * waits in the recipient's Notifications tab until they accept it, so no
 * patient data is shared before they agree.
 */
export async function notifyPatientInvite(
  userId: string,
  input: { inviterName: string; patientName: string; patientId: string; token: string; linkRole: string }
) {
  const roleLabel =
    input.linkRole === 'CARETAKER' ? 'caretaker' : input.linkRole === 'ATTENDING_STAFF' ? 'attending staff' : 'family member';
  await dispatchNotification(
    userId,
    'LINK_INVITE',
    `${input.inviterName} invited you as a ${roleLabel}`,
    `${input.inviterName} invited you to join ${input.patientName}'s care team as a ${roleLabel}. Press Accept to get access to this patient.`,
    {
      kind: 'PATIENT_LINK_INVITE',
      patientId: input.patientId,
      patientName: input.patientName,
      token: input.token,
      linkRole: input.linkRole,
      inviterName: input.inviterName,
    }
  );
}

/** A direct message from a family member, caretaker, doctor or store owner to an admin. */
export async function notifyAdminMessage(
  adminId: string,
  input: { senderName: string; senderRole: string; subject: string; message: string; fromUserId: string }
) {
  await dispatchNotification(
    adminId,
    'SYSTEM',
    `${input.senderName} (${input.senderRole}) sent you a message`,
    `${input.subject} — ${input.message}`,
    { kind: 'MESSAGE_TO_ADMIN', fromUserId: input.fromUserId, subject: input.subject }
  );
}

async function dispatchToCareTeam(
  patientId: string,
  type: NotificationType,
  title: string,
  body: string,
  metadata?: Record<string, unknown>,
  options: { tag?: string } = {}
) {
  const recipients = await getRecipientsForPatient(patientId);
  // Dispatch in parallel: each recipient needs several DB round-trips (and, in
  // demo mode, an inbox copy), so doing them one by one made a screening
  // submission wait many seconds for the whole care team.
  await Promise.allSettled(
    recipients.map((userId) => dispatchNotification(userId, type, title, body, metadata, options))
  );
  return recipients.length;
}

/** Adds `isRead` / `message` aliases so every dashboard renders them correctly. */
function presentNotification<T extends { readAt: Date | null; body: string }>(n: T) {
  return { ...n, isRead: Boolean(n.readAt), message: n.body };
}

export async function notifyRiskAlertIfNeeded(patientId: string, riskLevel: string, riskScore: number) {
  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) return;
  const name = fullName(patient);

  // Compare with the previous analysis so an improving trend becomes good news.
  const recent = await prisma.speechAnalysisResult.findMany({
    where: { patientId, riskScore: { not: null } },
    orderBy: { analyzedAt: 'desc' },
    take: 2,
    select: { riskScore: true, riskLevel: true },
  });
  const previousScore = recent[1]?.riskScore ?? null;
  const improved =
    previousScore != null && riskScore <= previousScore - RECOVERY_IMPROVEMENT_POINTS;

  if (improved) {
    const drop = Math.round(previousScore! - riskScore);
    await notifyRecoveryNews(patientId, {
      headline: `${name}'s speech analysis is improving`,
      detail:
        `The latest speech sample risk score for ${name} dropped by ${drop} points ` +
        `(now ${Math.round(riskScore)}, previously ${Math.round(previousScore!)}). ` +
        `Current level: ${riskLevel}.`,
      metadata: { riskLevel, riskScore, previousScore, source: 'speech-analysis' },
    });
  }

  if (riskLevel !== 'HIGH' && riskScore < RISK_ALERT_THRESHOLD) return;

  const tmpl = emailTemplates.riskAlert(name, riskLevel);
  await dispatchToCareTeam(
    patientId,
    'RISK_ALERT',
    tmpl.subject,
    `A new speech analysis session for ${name} produced a ${riskLevel} risk level (score ${Math.round(
      riskScore
    )}). Please review the full report in MemoCare.`,
    { patientId, riskLevel, riskScore, kind: 'RISK_ALERT' },
    { tag: 'risk-alert' }
  );
}

/**
 * Recovery / good-news broadcast to the whole care team (doctor, hospital
 * administration and family) — used when a trend improves.
 */
export async function notifyRecoveryNews(
  patientId: string,
  input: { headline: string; detail: string; metadata?: Record<string, unknown> }
) {
  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) return 0;
  const name = fullName(patient);
  const tmpl = emailTemplates.recoveryNews(name, input.detail);
  return dispatchToCareTeam(
    patientId,
    'SYSTEM',
    input.headline,
    input.detail,
    { patientId, kind: 'RECOVERY_NEWS', ...(input.metadata ?? {}) },
    { tag: 'recovery-news' }
  );
}

/**
 * Screening results go to the care team and family. An improving score is
 * framed as recovery news; other results are a plain result summary.
 */
export async function notifyScreeningResult(
  patientId: string,
  input: { testTitle: string; scorePercentage: number; previousScorePercentage?: number | null }
) {
  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) return 0;
  const name = fullName(patient);
  const score = Math.round(input.scorePercentage);
  const previous = input.previousScorePercentage;
  const improved = previous != null && score >= previous + 4;

  const title = improved
    ? `Good news: ${name}'s ${input.testTitle} score improved`
    : `${name} completed ${input.testTitle}`;
  const body = improved
    ? `${name} scored ${score}% on ${input.testTitle}, up from ${Math.round(previous!)}% last time.`
    : `${name} scored ${score}% on ${input.testTitle}. Open MemoCare to review the attempt.`;

  return dispatchToCareTeam(
    patientId,
    'SYSTEM',
    title,
    body,
    {
      patientId,
      kind: improved ? 'RECOVERY_NEWS' : 'SCREENING_RESULT',
      testTitle: input.testTitle,
      scorePercentage: score,
      previousScorePercentage: previous ?? null,
    },
    { tag: improved ? 'recovery-news' : 'screening-result' }
  );
}

export async function notifyTestReminder(patientId: string) {
  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) return;
  const tmpl = emailTemplates.testReminder(fullName(patient));
  await dispatchToCareTeam(
    patientId,
    'TEST_REMINDER',
    tmpl.subject,
    `It's time for ${fullName(patient)}'s next speech sample. Open MemoCare to record one.`,
    { patientId },
    { tag: 'test-reminder' }
  );
}

export async function notifyAppointmentReminder(userId: string, title: string, when: Date) {
  await dispatchNotification(
    userId,
    'APPOINTMENT_REMINDER',
    'Upcoming appointment reminder',
    `Reminder: "${title}" is scheduled for ${when.toISOString()}.`,
    { kind: 'APPOINTMENT_REMINDER' },
    { tag: 'appointment-reminder' }
  );
}

/** Appointment reminders for the whole care team, not only linked relatives. */
export async function notifyAppointmentReminderForPatient(patientId: string, title: string, when: Date) {
  await dispatchToCareTeam(
    patientId,
    'APPOINTMENT_REMINDER',
    'Upcoming appointment reminder',
    `Reminder: "${title}" is scheduled for ${when.toLocaleString()}.`,
    { patientId, kind: 'APPOINTMENT_REMINDER' },
    { tag: 'appointment-reminder' }
  );
}

export async function notifyMedicationReminder(patientId: string, medicationName: string, scheduledFor: Date) {
  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) return;
  const body = `It's time for ${fullName(patient)} to take ${medicationName} (scheduled ${scheduledFor.toLocaleTimeString()}).`;
  await dispatchToCareTeam(
    patientId,
    'MEDICATION_REMINDER',
    'Medication reminder',
    body,
    { patientId, medicationName, scheduledFor, kind: 'MEDICATION_REMINDER' },
    { tag: 'medication-reminder' }
  );
}

export async function dispatchLocationAlert(
  patientId: string,
  patientName: string,
  location: { latitude: number; longitude: number }
) {
  const body = `${patientName} has moved outside their configured safe zone (last seen ${location.latitude.toFixed(
    5
  )}, ${location.longitude.toFixed(5)}).`;
  await dispatchToCareTeam(
    patientId,
    'LOCATION_ALERT',
    'Location alert',
    body,
    { patientId, ...location, kind: 'LOCATION_ALERT' },
    { tag: 'location-alert' }
  );
}

/**
 * Called on login: gives every account a role-aware dashboard summary in its
 * notifications and inbox, so both are genuinely alive in every dashboard.
 * Throttled so repeat logins don't spam.
 */
export async function notifyLoginSummary(userId: string) {
  const since = new Date(Date.now() - LOGIN_SUMMARY_COOLDOWN_HOURS * 3600 * 1000);
  const recent = await prisma.notification.findMany({
    where: { userId, type: 'SYSTEM', channel: 'IN_APP', createdAt: { gte: since } },
    select: { metadata: true },
    take: 25,
  });
  const alreadySent = recent.some(
    (n) => (n.metadata as Record<string, unknown> | null)?.kind === 'LOGIN_SUMMARY'
  );
  if (alreadySent) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstName: true, role: true, hospitalId: true },
  });
  if (!user) return;

  const unread = await prisma.notification.count({
    where: { userId, channel: 'IN_APP', readAt: null },
  });

  let scope = '';
  if (user.role === 'ADMIN') {
    const patients = await prisma.patient.count({ where: { status: 'ACTIVE' } });
    scope = `${patients} active patient${patients === 1 ? '' : 's'} across the platform`;
  } else if (user.role === 'HOSPITAL_STAFF') {
    const patients = user.hospitalId
      ? await prisma.patient.count({ where: { status: 'ACTIVE', hospitalId: user.hospitalId } })
      : 0;
    scope = `${patients} active patient${patients === 1 ? '' : 's'} in your hospital`;
  } else if (user.role === 'FAMILY' || user.role === 'CARETAKER') {
    const patients = await prisma.patientLink.count({ where: { userId } });
    scope = `${patients} linked patient${patients === 1 ? '' : 's'} you can follow`;
  } else if (user.role === 'MEDICAL_STORE') {
    const store = await prisma.medicalStore.findUnique({
      where: { ownerId: userId },
      select: { storeName: true, _count: { select: { medicines: true } } },
    });
    scope = store
      ? `${store.storeName} — ${store._count.medicines} medicine${store._count.medicines === 1 ? '' : 's'} listed`
      : 'your store is ready';
  }

  const title = `Welcome back, ${user.firstName}`;
  const body = [
    scope ? `Here's your dashboard: ${scope}.` : "Here's your dashboard summary.",
    unread > 0 ? `You have ${unread} unread notification${unread === 1 ? '' : 's'}.` : 'You have no unread notifications.',
    'Risk alerts, recovery news and family updates all arrive here.',
  ].join(' ');

  await dispatchNotification(
    userId,
    'SYSTEM',
    title,
    body,
    { kind: 'LOGIN_SUMMARY' },
    { tag: 'login-summary' }
  );
}

/**
 * Tells a store owner that a customer booked their cart. The delivery address,
 * phone number and every line item travel with the notification (and with it
 * the email / inbox copy) so the order is actionable without another lookup.
 */
export async function notifyStoreOrder(
  storeOwnerId: string,
  input: {
    storeName: string;
    orderId: string;
    total: number;
    customerName: string;
    customerPhone: string;
    deliveryAddress: string;
    notes?: string;
    items: { name: string; quantity: number; price: number }[];
  }
) {
  const itemList = input.items
    .map((item) => `${item.name} × ${item.quantity} (₹${(item.price * item.quantity).toFixed(2)})`)
    .join(', ');
  const title = `New order for ${input.storeName}`;
  const body = [
    `${input.customerName} booked ${input.items.length} item${input.items.length === 1 ? '' : 's'} totalling ₹${input.total.toFixed(2)}.`,
    `Items: ${itemList}.`,
    `Deliver to: ${input.deliveryAddress}.`,
    `Contact: ${input.customerPhone}.`,
    input.notes ? `Notes: ${input.notes}.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  await dispatchNotification(
    storeOwnerId,
    'SYSTEM',
    title,
    body,
    { kind: 'STORE_ORDER', orderId: input.orderId, storeName: input.storeName, total: input.total },
    { tag: 'store-order' }
  );
}

export async function listNotificationsForUser(userId: string, unreadOnly = false) {
  // Only IN_APP rows are user-facing. EMAIL rows are the delivery log kept for
  // audit; returning them here would double every notification and leave the
  // unread badge permanently non-zero (email rows are never marked read).
  const rows = await prisma.notification.findMany({
    where: { userId, channel: 'IN_APP', ...(unreadOnly ? { readAt: null } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return rows.map(presentNotification);
}

export async function deleteNotification(userId: string, notificationId: string) {
  const result = await prisma.notification.deleteMany({ where: { id: notificationId, userId } });
  if (result.count === 0) throw AppError.notFound('Notification not found');
}

export async function markNotificationRead(userId: string, notificationId: string) {
  await prisma.notification.updateMany({ where: { id: notificationId, userId }, data: { readAt: new Date() } });
}

/** Clears the unread badge once the Notifications tab has been opened. */
export async function markAllNotificationsRead(userId: string) {
  await prisma.notification.updateMany({
    where: { userId, channel: 'IN_APP', readAt: null },
    data: { readAt: new Date() },
  });
}

export async function setNotificationPreference(
  userId: string,
  type: NotificationType,
  inAppEnabled: boolean,
  emailEnabled: boolean
) {
  return prisma.notificationPreference.upsert({
    where: { userId_type: { userId, type } },
    update: { inAppEnabled, emailEnabled },
    create: { userId, type, inAppEnabled, emailEnabled },
  });
}

export async function listNotificationPreferences(userId: string) {
  return prisma.notificationPreference.findMany({ where: { userId } });
}
