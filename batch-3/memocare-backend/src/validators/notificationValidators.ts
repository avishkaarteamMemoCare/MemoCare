import { z } from 'zod';

export const setPreferenceSchema = z.object({
  type: z.enum([
    'TEST_REMINDER',
    'RISK_ALERT',
    'LINK_INVITE',
    'APPOINTMENT_REMINDER',
    'MEDICATION_REMINDER',
    'LOCATION_ALERT',
    'SYSTEM',
  ]),
  inAppEnabled: z.boolean(),
  emailEnabled: z.boolean(),
});
