import { z } from 'zod';

export const mailSettingsSchema = z.object({
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  username: z.string().max(255).optional().default(''),
  /** Blank keeps the saved password. */
  password: z.string().max(500).optional().default(''),
  fromName: z.string().max(120).optional().default('MemoCare'),
  fromEmail: z.string().email(),
  enabled: z.boolean().optional().default(true),
});

export const testMailSchema = z.object({
  host: z.string().max(255).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  secure: z.boolean().optional(),
  username: z.string().max(255).optional(),
  password: z.string().max(500).optional(),
});

export const testEmailSchema = z.object({
  to: z.string().email().optional(),
});

export const sendMailSchema = z
  .object({
    userIds: z.array(z.string().uuid()).max(500).optional(),
    emails: z.array(z.string().email()).max(50).optional(),
    subject: z.string().min(1).max(200),
    message: z.string().min(1).max(5000),
  })
  .refine((data) => (data.userIds?.length ?? 0) + (data.emails?.length ?? 0) > 0, {
    message: 'Choose at least one recipient',
    path: ['userIds'],
  });

/** A message written by any signed-in account to hospital management. */
export const contactAdminSchema = z.object({
  adminId: z.string().uuid().optional(),
  subject: z.string().min(1).max(200),
  message: z.string().min(1).max(5000),
});
