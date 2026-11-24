import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { logger } from '../config/logger';
import { AppError } from '../utils/errors';
import { decryptField } from '../utils/encryption';

/**
 * Real email delivery for MemoCare.
 *
 * SMTP credentials come from either:
 *  - the MailSettings row saved by an admin in **Admin → Mail Center**, or
 *  - the SMTP_URL / SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS env vars.
 *
 * Every message is also stored per recipient, which is what powers each
 * user's **Mail → Inbox** page: the address decides whose inbox it lands in,
 * so a message sent to doctor@… appears for that doctor and nobody else.
 *
 * When an SMTP account is configured the message really leaves the server
 * (status SENT); without one it is still delivered to the recipient's in-app
 * inbox (status INBOX) instead of being thrown away.
 */

export interface MailDeliveryConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
  /** Only set for the SMTP_URL environment form. */
  url?: string;
  source: 'database' | 'environment';
}

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  /** Free-form label used in the delivery log (e.g. "risk-alert"). */
  tag?: string;
  /** Admin who triggered the message, when it is a manual send. */
  sentById?: string;
}

export interface SendEmailResult {
  id: string;
  /** `smtp` = really handed to the mail server, `inbox` = in-app delivery. */
  mode: 'smtp' | 'inbox';
}

function parseFrom(raw: string): { fromName: string; fromEmail: string } {
  const match = raw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) {
    return { fromName: match[1].replace(/^"|"$/g, '') || 'MemoCare', fromEmail: match[2].trim() };
  }
  return { fromName: 'MemoCare', fromEmail: raw.trim() };
}

/** The SMTP account currently in effect, or null when none is configured. */
export async function getMailConfig(): Promise<MailDeliveryConfig | null> {
  try {
    const row = await prisma.mailSettings.findUnique({ where: { id: 'default' } });
    if (row?.enabled && row.host && row.fromEmail) {
      let pass = '';
      try {
        pass = decryptField(row.passwordEnc) ?? '';
      } catch (err) {
        logger.error({ err }, 'Could not decrypt the stored SMTP password');
      }
      return {
        host: row.host,
        port: row.port,
        secure: row.secure,
        user: row.username,
        pass,
        fromName: row.fromName,
        fromEmail: row.fromEmail,
        source: 'database',
      };
    }
  } catch (err) {
    // The table may be missing on a database that has not been migrated yet;
    // fall back to the environment rather than breaking every email.
    logger.warn({ err }, 'Could not read the saved SMTP settings');
  }

  if (env.smtp.configured) {
    const from = parseFrom(env.smtp.from);
    return {
      url: env.smtp.url || undefined,
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      user: env.smtp.user,
      pass: env.smtp.pass,
      fromName: from.fromName,
      fromEmail: from.fromEmail,
      source: 'environment',
    };
  }

  return null;
}

export async function isMailConfigured(): Promise<boolean> {
  return (await getMailConfig()) !== null;
}

function buildTransport(cfg: MailDeliveryConfig): Transporter {
  if (cfg.url) return nodemailer.createTransport(cfg.url);
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 25000,
  });
}

// Reuse a transporter for the same settings instead of opening a new pool for
// every notification in a fan-out.
let cachedTransport: { key: string; transporter: Transporter } | null = null;

function getTransport(cfg: MailDeliveryConfig): Transporter {
  const key = [cfg.source, cfg.url ?? '', cfg.host, cfg.port, cfg.secure, cfg.user, cfg.pass].join('|');
  if (cachedTransport?.key !== key) {
    cachedTransport = { key, transporter: buildTransport(cfg) };
  }
  return cachedTransport.transporter;
}

export function formatFrom(cfg: MailDeliveryConfig): string {
  return cfg.fromName ? `${cfg.fromName} <${cfg.fromEmail}>` : cfg.fromEmail;
}

function describeSmtpError(err: any): string {
  const parts = [err?.message, err?.code, err?.command, err?.response]
    .filter(Boolean)
    .join(' | ');
  return parts || String(err);
}

async function recordDelivery(input: {
  toEmail: string;
  subject: string;
  body: string;
  tag?: string;
  status: 'SENT' | 'INBOX' | 'FAILED';
  error?: string;
  sentById?: string;
}) {
  try {
    await prisma.sentEmail.create({
      data: {
        toEmail: input.toEmail,
        subject: input.subject,
        body: input.body,
        tag: input.tag,
        status: input.status,
        error: input.error,
        sentById: input.sentById,
      },
    });
  } catch (err) {
    logger.warn({ err }, 'Could not write the email delivery log');
  }
}

/**
 * Sends an email through the configured SMTP server. Throws a clear 503 when
 * no SMTP account is configured, or when the provider rejects the message, so
 * failures are visible instead of silently swallowed.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const to = (Array.isArray(input.to) ? input.to : [input.to]).map((a) => String(a).trim()).filter(Boolean);
  if (!to.length) return { id: '', mode: 'inbox' };

  if (env.isTest) {
    logger.debug({ to, subject: input.subject }, 'Email suppressed (test env)');
    return { id: 'test-suppressed', mode: 'inbox' };
  }

  const body = input.text ?? '';
  const cfg = await getMailConfig();

  // No SMTP account yet: deliver every message to the recipient's MemoCare
  // inbox. The address decides the owner, so nothing is lost or misrouted.
  if (!cfg) {
    for (const address of to) {
      await recordDelivery({
        toEmail: address,
        subject: input.subject,
        body,
        tag: input.tag,
        status: 'INBOX',
        sentById: input.sentById,
      });
    }
    logger.info({ to, subject: input.subject }, 'Email delivered to the in-app inbox (no SMTP configured)');
    return { id: '', mode: 'inbox' };
  }

  let messageId = '';
  let failure: string | null = null;

  // One record per address, so each recipient's inbox only shows their own
  // copy. A failed real send is still readable in the app, flagged as failed.
  for (const address of to) {
    try {
      const info = await getTransport(cfg).sendMail({
        from: formatFrom(cfg),
        to: address,
        subject: input.subject,
        html: input.html,
        text: input.text,
      });
      messageId = info?.messageId ?? messageId;
      await recordDelivery({
        toEmail: address,
        subject: input.subject,
        body,
        tag: input.tag,
        status: 'SENT',
        sentById: input.sentById,
      });
      logger.info({ to: address, subject: input.subject, messageId: info?.messageId }, 'Email sent');
    } catch (err: any) {
      const detail = describeSmtpError(err);
      failure = detail;
      logger.error(
        { err: detail, host: cfg.host, port: cfg.port, from: formatFrom(cfg), to: address, subject: input.subject },
        'Failed to send email'
      );
      await recordDelivery({
        toEmail: address,
        subject: input.subject,
        body,
        tag: input.tag,
        status: 'FAILED',
        error: detail,
        sentById: input.sentById,
      });
    }
  }

  if (failure) {
    throw AppError.serviceUnavailable(
      `Email delivery failed (${failure}). Check the SMTP settings and that the sender address is verified with your provider.`
    );
  }
  return { id: messageId, mode: 'smtp' };
}

/**
 * Verifies the SMTP account without sending a message. `override` lets the
 * Mail Center test credentials before saving them.
 */
export async function verifyMailConnection(
  override?: Partial<Pick<MailDeliveryConfig, 'host' | 'port' | 'secure' | 'user' | 'pass' | 'fromEmail' | 'fromName'>>
): Promise<{ ok: boolean; error?: string }> {
  const saved = await getMailConfig();
  const envFrom = parseFrom(env.smtp.from);
  // Typed-in credentials can be tested before they are saved.
  const cfg: MailDeliveryConfig | null = saved
    ? {
        ...saved,
        host: override?.host ?? saved.host,
        port: override?.port ?? saved.port,
        secure: override?.secure ?? saved.secure,
        user: override?.user ?? saved.user,
        pass: override?.pass ?? saved.pass,
        fromEmail: override?.fromEmail ?? saved.fromEmail,
        fromName: override?.fromName ?? saved.fromName,
      }
    : override?.host
    ? {
        host: override.host,
        port: override.port ?? env.smtp.port ?? 587,
        secure: override.secure ?? false,
        user: override.user ?? '',
        pass: override.pass ?? '',
        fromName: override.fromName ?? 'MemoCare',
        fromEmail: override.fromEmail ?? envFrom.fromEmail,
        source: 'database',
      }
    : null;
  if (!cfg || !cfg.host) {
    return { ok: false, error: 'No SMTP server settings are saved yet.' };
  }
  try {
    await buildTransport(cfg).verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: describeSmtpError(err) };
  }
}

/** Send a probe email to verify the SMTP setup end-to-end. */
export async function sendTestEmail(to: string): Promise<SendEmailResult> {
  return sendEmail({
    to,
    tag: 'smtp-test',
    subject: 'MemoCare SMTP test',
    html: emailLayout(
      'SMTP test',
      `<p>This is a test message from the MemoCare backend. If you are reading this, your SMTP configuration works.</p>`
    ),
    text: 'This is a test message from the MemoCare backend. If you are reading this, your SMTP configuration works.',
  });
}

export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Consistent, mail-client-safe wrapper for every MemoCare notification email. */
export function emailLayout(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f6fb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e3e8f2;">
            <tr>
              <td style="background:#1f3a5f;padding:18px 24px;color:#ffffff;font-size:17px;font-weight:700;letter-spacing:.2px;">
                MemoCare
              </td>
            </tr>
            <tr>
              <td style="padding:24px;color:#22314a;font-size:14.5px;line-height:1.6;">
                <h2 style="margin:0 0 14px;font-size:18px;color:#16233a;">${title}</h2>
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background:#f7f9fd;color:#7a869c;font-size:12px;line-height:1.5;">
                This message was sent by MemoCare. If you were not expecting it, you can ignore it.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export const emailTemplates = {
  verifyEmail: (verifyUrl: string) => ({
    subject: 'Verify your MemoCare account',
    html: emailLayout(
      'Verify your account',
      `<p>Welcome to MemoCare. Please verify your email by clicking the link below:</p>
       <p><a href="${verifyUrl}">${verifyUrl}</a></p>
       <p>This link expires in 24 hours.</p>`
    ),
    text: `Welcome to MemoCare. Verify your email: ${verifyUrl}`,
  }),
  passwordReset: (resetUrl: string) => ({
    subject: 'Reset your MemoCare password',
    html: emailLayout(
      'Reset your password',
      `<p>We received a request to reset your password.</p>
       <p><a href="${resetUrl}">${resetUrl}</a></p>
       <p>If you did not request this, you can safely ignore this email. This link expires in 1 hour.</p>`
    ),
    text: `Reset your MemoCare password: ${resetUrl}`,
  }),
  patientLinkInvite: (inviterName: string, patientName: string, acceptUrl: string) => ({
    subject: `${inviterName} invited you to MemoCare`,
    html: emailLayout(
      'You have been invited',
      `<p>${inviterName} has invited you to collaborate on care for ${patientName} on MemoCare.</p>
       <p><a href="${acceptUrl}">${acceptUrl}</a></p>`
    ),
    text: `${inviterName} invited you to collaborate on care for ${patientName}: ${acceptUrl}`,
  }),
  riskAlert: (patientName: string, riskLevel: string) => ({
    subject: `Risk alert for ${patientName}`,
    html: emailLayout(
      'Risk alert',
      `<p>A new speech analysis session for ${patientName} produced a <strong>${riskLevel}</strong> risk level. Please review the full report in MemoCare.</p>`
    ),
    text: `A new speech analysis session for ${patientName} produced a ${riskLevel} risk level.`,
  }),
  testReminder: (patientName: string) => ({
    subject: `Reminder: complete a speech check-in for ${patientName}`,
    html: emailLayout(
      'Speech check-in reminder',
      `<p>It's time for ${patientName}'s next speech sample. Open MemoCare to record one.</p>`
    ),
    text: `It's time for ${patientName}'s next speech sample.`,
  }),
  recoveryNews: (patientName: string, detail: string) => ({
    subject: `Good news about ${patientName}`,
    html: emailLayout(
      `Good news about ${patientName}`,
      `<p>${detail}</p><p>Open MemoCare to see the full progress report.</p>`
    ),
    text: `${detail}`,
  }),
  screeningResult: (patientName: string, testTitle: string, score: number, improved: boolean) => ({
    subject: improved
      ? `Good news: ${patientName}'s ${testTitle} score improved`
      : `${patientName}'s ${testTitle} results are in`,
    html: emailLayout(
      improved ? 'A score is moving in the right direction' : 'New screening result',
      `<p><strong>${patientName}</strong> completed <strong>${testTitle}</strong> and scored <strong>${score}%</strong>.</p>
       <p>${improved ? 'That is an improvement on the previous attempt. Keep it up.' : 'Open MemoCare to review the attempt in detail.'}</p>`
    ),
    text: `${patientName} completed ${testTitle} and scored ${score}%.`,
  }),
  staffWelcome: (input: { name: string; email: string; password: string; staffTitle: string; hospitalName?: string; loginUrl: string }) => ({
    subject: 'Your MemoCare staff account is ready',
    html: emailLayout(
      'Your staff account is ready',
      `<p>Hi ${escapeHtml(input.name)},</p>
       <p>Hospital management created a ${escapeHtml(input.staffTitle.toLowerCase().replace(/_/g, ' '))} account for you${
         input.hospitalName ? ` at <strong>${escapeHtml(input.hospitalName)}</strong>` : ''
       } on MemoCare.</p>
       <p><strong>Sign in:</strong> <a href="${input.loginUrl}">${input.loginUrl}</a><br/>
       <strong>Email:</strong> ${escapeHtml(input.email)}<br/>
       <strong>Temporary password:</strong> ${escapeHtml(input.password)}</p>
       <p>Please sign in and change your password from Profile → Security.</p>`
    ),
    text: `Your MemoCare staff account is ready.\nSign in: ${input.loginUrl}\nEmail: ${input.email}\nTemporary password: ${input.password}`,
  }),
  adminMessage: (input: { subject: string; messageHtml: string; senderName: string }) => ({
    subject: input.subject,
    html: emailLayout(
      escapeHtml(input.subject),
      `${input.messageHtml}
       <p style="margin-top:22px;color:#5b6a82;font-size:13px;">— ${escapeHtml(input.senderName)}, MemoCare</p>`
    ),
  }),
};
