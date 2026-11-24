import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { AppError } from '../utils/errors';
import { encryptField } from '../utils/encryption';
import {
  emailTemplates,
  escapeHtml,
  getMailConfig,
  sendEmail,
  verifyMailConnection,
} from './emailService';
import * as notificationService from './notificationService';

/**
 * Admin Mail Center: configure the SMTP account, send a message to any user
 * (or any address), and review the real delivery log.
 */

function envFrom() {
  const raw = env.smtp.from;
  const match = raw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) return { fromName: match[1].replace(/^"|"$/g, '') || 'MemoCare', fromEmail: match[2].trim() };
  return { fromName: 'MemoCare', fromEmail: raw.trim() };
}

export async function getMailSettings() {
  const [row, cfg] = await Promise.all([
    prisma.mailSettings.findUnique({ where: { id: 'default' } }),
    getMailConfig(),
  ]);
  const fallback = envFrom();
  return {
    configured: Boolean(cfg),
    source: cfg?.source ?? null,
    host: row?.host ?? env.smtp.host ?? '',
    port: row?.port ?? (env.smtp.port || 587),
    secure: row?.secure ?? (env.smtp.port === 465),
    username: row?.username ?? env.smtp.user ?? '',
    // Only claim a password exists when there really is one: a checked-in
    // placeholder in SMTP_PASS (or no SMTP config at all) must not show as
    // "saved".
    passwordSet: Boolean(row?.passwordEnc) || (cfg?.source === 'environment' && Boolean(cfg.pass)),
    fromName: row?.fromName ?? fallback.fromName,
    fromEmail: row?.fromEmail ?? fallback.fromEmail,
    enabled: row?.enabled ?? true,
    updatedAt: row?.updatedAt ?? null,
  };
}

export interface SaveMailSettingsInput {
  host: string;
  port: number;
  secure: boolean;
  username?: string;
  /** Blank means "keep the password already saved". */
  password?: string;
  fromName?: string;
  fromEmail: string;
  enabled?: boolean;
}

export async function saveMailSettings(input: SaveMailSettingsInput, updatedById: string) {
  const existing = await prisma.mailSettings.findUnique({ where: { id: 'default' } });

  let passwordEnc = existing?.passwordEnc;
  if (input.password) {
    passwordEnc = encryptField(input.password);
  } else if (!passwordEnc && env.smtp.pass) {
    // First save from a UI where only the env credentials existed.
    passwordEnc = encryptField(env.smtp.pass);
  }
  if (!passwordEnc) {
    throw AppError.badRequest('Enter the SMTP password (or app password / API key) to use.');
  }

  await prisma.mailSettings.upsert({
    where: { id: 'default' },
    update: {
      host: input.host.trim(),
      port: input.port,
      secure: input.secure,
      username: (input.username ?? '').trim(),
      passwordEnc,
      fromName: (input.fromName ?? 'MemoCare').trim() || 'MemoCare',
      fromEmail: input.fromEmail.trim().toLowerCase(),
      enabled: input.enabled ?? true,
      updatedById,
    },
    create: {
      id: 'default',
      host: input.host.trim(),
      port: input.port,
      secure: input.secure,
      username: (input.username ?? '').trim(),
      passwordEnc,
      fromName: (input.fromName ?? 'MemoCare').trim() || 'MemoCare',
      fromEmail: input.fromEmail.trim().toLowerCase(),
      enabled: input.enabled ?? true,
      updatedById,
    },
  });

  const verification = await verifyMailConnection();
  return { settings: await getMailSettings(), verification };
}

/** Tests the saved account, or credentials typed into the form before saving. */
export async function testMailConnection(input?: {
  host?: string;
  port?: number;
  secure?: boolean;
  username?: string;
  password?: string;
}) {
  if (!input?.host && !input?.password) {
    const saved = await verifyMailConnection();
    return { ...saved, tested: 'saved' as const };
  }

  // A typed password is used as-is; a blank field reuses the saved password.
  let password = input?.password ?? '';
  if (!password) {
    const cfg = await getMailConfig();
    password = cfg?.pass ?? '';
  }
  const result = await verifyMailConnection({
    host: input?.host,
    port: input?.port,
    secure: input?.secure,
    user: input?.username,
    pass: password,
  });
  return { ...result, tested: 'entered' as const };
}

export async function listMailRecipients() {
  const users = await prisma.user.findMany({
    orderBy: [{ role: 'asc' }, { firstName: 'asc' }],
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      status: true,
      hospital: { select: { name: true } },
      // A medical-store account is known by its shop name, not its owner's name.
      medicalStore: { select: { storeName: true } },
    },
    take: 500,
  });
  return users;
}

export interface SendAdminMailInput {
  userIds?: string[];
  emails?: string[];
  subject: string;
  message: string;
}

export async function sendAdminMail(
  input: SendAdminMailInput,
  admin: { id: string; name: string }
) {
  const recipients = new Map<string, string>();

  if (input.userIds?.length) {
    const users = await prisma.user.findMany({
      where: { id: { in: input.userIds } },
      select: { email: true, firstName: true, lastName: true },
    });
    users.forEach((u) => recipients.set(u.email.toLowerCase(), `${u.firstName} ${u.lastName}`.trim()));
  }

  for (const raw of input.emails ?? []) {
    const email = raw.trim().toLowerCase();
    if (!email) continue;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw AppError.badRequest(`"${raw}" is not a valid email address`);
    }
    if (!recipients.has(email)) recipients.set(email, '');
  }

  if (recipients.size === 0) {
    throw AppError.badRequest('Choose at least one recipient.');
  }

  const messageHtml = input.message
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br/>')}</p>`)
    .join('');
  const tmpl = emailTemplates.adminMessage({
    subject: input.subject,
    messageHtml,
    senderName: admin.name || 'Hospital management',
  });

  // `delivery` tells the UI whether the copy was really emailed or only
  // stored in the recipient's in-app Mail (demo mode: no SMTP configured).
  const results: { to: string; status: 'sent' | 'failed'; delivery?: 'smtp' | 'inbox'; error?: string }[] = [];
  for (const email of recipients.keys()) {
    try {
      const delivered = await sendEmail({
        to: email,
        subject: input.subject,
        html: tmpl.html,
        text: input.message,
        tag: 'admin-message',
        sentById: admin.id,
      });
      results.push({ to: email, status: 'sent', delivery: delivered.mode });
    } catch (err: any) {
      results.push({ to: email, status: 'failed', error: err?.message ?? String(err) });
    }
  }

  const sent = results.filter((r) => r.status === 'sent').length;
  return {
    total: results.length,
    sent,
    failed: results.length - sent,
    results,
  };
}

/**
 * Hospital-management accounts a signed-in user may write to. Users linked to
 * a hospital see their own hospital's admins; everyone else sees all admins.
 */
export async function listAdminsForUser(user: { hospitalId?: string | null }) {
  return prisma.user.findMany({
    where: {
      role: 'ADMIN',
      status: 'ACTIVE',
      ...(user.hospitalId ? { OR: [{ hospitalId: user.hospitalId }, { hospitalId: null }] } : {}),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      hospital: { select: { name: true } },
    },
    orderBy: [{ firstName: 'asc' }],
    take: 50,
  });
}

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Hospital management',
  HOSPITAL_STAFF: 'Doctor',
  FAMILY: 'Family member',
  CARETAKER: 'Caretaker',
  MEDICAL_STORE: 'Medical store',
};

/**
 * Family members, caretakers, doctors and store owners write to hospital
 * management. The message lands in the admin's Notifications tab (and, once
 * SMTP is configured, in their email inbox too).
 */
export async function sendUserMessageToAdmin(
  input: { adminId?: string; subject: string; message: string },
  sender: { id: string; name: string; role: string; hospitalId?: string | null }
) {
  const admins = input.adminId
    ? await prisma.user.findMany({
        where: { id: input.adminId, role: 'ADMIN', status: 'ACTIVE' },
        select: { id: true, email: true, firstName: true, lastName: true },
      })
    : await listAdminsForUser(sender);

  if (!admins.length) throw AppError.notFound('No hospital management account is available to receive this message');

  const senderRole = ROLE_LABEL[sender.role] || sender.role;
  const messageHtml = input.message
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br/>')}</p>`)
    .join('');
  const tmpl = emailTemplates.adminMessage({
    subject: input.subject,
    messageHtml,
    senderName: `${sender.name} (${senderRole})`,
  });

  const results: { to: string; status: 'sent' | 'failed'; delivery?: 'smtp' | 'inbox'; error?: string }[] = [];
  for (const admin of admins) {
    await notificationService.notifyAdminMessage(admin.id, {
      senderName: sender.name,
      senderRole,
      subject: input.subject,
      message: input.message,
      fromUserId: sender.id,
    });
    try {
      const delivered = await sendEmail({
        to: admin.email,
        subject: input.subject,
        html: tmpl.html,
        text: input.message,
        tag: 'user-message',
        sentById: sender.id,
      });
      results.push({ to: admin.email, status: 'sent', delivery: delivered.mode });
    } catch (err: any) {
      results.push({ to: admin.email, status: 'failed', error: err?.message ?? String(err) });
    }
  }

  const sent = results.filter((r) => r.status === 'sent').length;
  return { total: results.length, sent, failed: results.length - sent, results };
}

export async function listSentMail(limit = 100) {
  return prisma.sentEmail.findMany({
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 200),
    select: {
      id: true,
      toEmail: true,
      subject: true,
      tag: true,
      status: true,
      error: true,
      createdAt: true,
    },
  });
}

/**
 * A single user's inbox. Rows are matched by the recipient address, so each
 * account only ever sees mail addressed to its own email — including
 * automated risk alerts, recovery news and admin messages.
 */
export async function listInboxForUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (!user?.email) return [];

  const rows = await prisma.sentEmail.findMany({
    where: { toEmail: { equals: user.email, mode: 'insensitive' } },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      toEmail: true,
      subject: true,
      body: true,
      tag: true,
      status: true,
      sentById: true,
      createdAt: true,
    },
  });

  // Attach the sender's name so every message says who wrote it, instead of a
  // generic "a care-team member". Automated alerts have no sender row.
  const senderIds = [...new Set(rows.map((r) => r.sentById).filter(Boolean))] as string[];
  const senders = senderIds.length
    ? await prisma.user.findMany({
        where: { id: { in: senderIds } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          role: true,
          medicalStore: { select: { storeName: true } },
        },
      })
    : [];
  const senderById = new Map(senders.map((s) => [s.id, s]));

  return rows.map((row) => {
    const sender = row.sentById ? senderById.get(row.sentById) : undefined;
    const person = `${sender?.firstName ?? ''} ${sender?.lastName ?? ''}`.trim();
    const fromName =
      sender?.medicalStore?.storeName ||
      person ||
      (row.tag === 'admin-message'
        ? 'Hospital management'
        : row.tag === 'user-message'
          ? 'A care-team member'
          : 'MemoCare');
    return {
      ...row,
      fromName,
      fromRole: sender ? ROLE_LABEL[sender.role] || sender.role : null,
    };
  });
}

/**
 * Deletes one message from the signed-in user's own inbox. Only a row addressed
 * to that account's email can be removed, so nobody can delete another
 * person's mail by guessing an id.
 */
export async function deleteInboxMail(userId: string, mailId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user?.email) throw AppError.notFound('Mail not found');

  const mail = await prisma.sentEmail.findUnique({ where: { id: mailId }, select: { toEmail: true } });
  if (!mail || mail.toEmail.toLowerCase() !== user.email.toLowerCase()) {
    throw AppError.notFound('Mail not found');
  }
  await prisma.sentEmail.delete({ where: { id: mailId } });
}

/** Management removes one row from the delivery history. */
export async function deleteSentMail(mailId: string) {
  const result = await prisma.sentEmail.deleteMany({ where: { id: mailId } });
  if (result.count === 0) throw AppError.notFound('Mail not found');
}

/** Status strip for the Mail Center header. */
export async function mailStatus() {
  const [settings, sent, inbox, failed] = await Promise.all([
    getMailSettings(),
    prisma.sentEmail.count({ where: { status: 'SENT' } }),
    prisma.sentEmail.count({ where: { status: 'INBOX' } }),
    prisma.sentEmail.count({ where: { status: 'FAILED' } }),
  ]);
  return { ...settings, delivered: sent, inApp: inbox, failed };
}
