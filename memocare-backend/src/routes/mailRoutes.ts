import { Router } from 'express';
import * as mailController from '../controllers/mailController';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import {
  mailSettingsSchema,
  sendMailSchema,
  testEmailSchema,
  testMailSchema,
} from '../validators/mailValidators';

// Mounted at /api/v1/admin/mail — hospital management only.
const router = Router();
router.use(authenticate, requireRole('ADMIN'));

/**
 * @openapi
 * /admin/mail/settings:
 *   get:
 *     tags: [Mail]
 *     summary: Current SMTP configuration (password never returned) and delivery counts
 *   put:
 *     tags: [Mail]
 *     summary: Save the SMTP host, credentials and sender address
 */
router.get('/settings', mailController.getSettings);
router.put('/settings', validate(mailSettingsSchema), mailController.saveSettings);

/**
 * @openapi
 * /admin/mail/test-connection:
 *   post:
 *     tags: [Mail]
 *     summary: Verify the saved SMTP account (or credentials passed in the body)
 */
router.post('/test-connection', validate(testMailSchema), mailController.testConnection);

/**
 * @openapi
 * /admin/mail/test-email:
 *   post:
 *     tags: [Mail]
 *     summary: Send a real test email to the signed-in admin
 */
router.post('/test-email', validate(testEmailSchema), mailController.sendTest);

/**
 * @openapi
 * /admin/mail/recipients:
 *   get:
 *     tags: [Mail]
 *     summary: Every registered user who can receive a message
 */
router.get('/recipients', mailController.listRecipients);

/**
 * @openapi
 * /admin/mail/send:
 *   post:
 *     tags: [Mail]
 *     summary: Send a real email to selected users and/or extra addresses
 */
router.post('/send', validate(sendMailSchema), mailController.sendMail);

/**
 * @openapi
 * /admin/mail/sent:
 *   get:
 *     tags: [Mail]
 *     summary: Recent real delivery attempts with their status
 */
router.get('/sent', mailController.sentHistory);

/** Remove one row from the delivery history. */
router.delete('/sent/:mailId', mailController.deleteSentMail);

export default router;
