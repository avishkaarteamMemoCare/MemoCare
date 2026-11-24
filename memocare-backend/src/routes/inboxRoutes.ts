import { Router } from 'express';
import * as mailController from '../controllers/mailController';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { contactAdminSchema } from '../validators/mailValidators';

// Mounted at /api/v1/mail — every signed-in account can read its own inbox.
const router = Router();
router.use(authenticate);

/**
 * @openapi
 * /mail/inbox:
 *   get:
 *     tags: [Mail]
 *     summary: Messages delivered to the signed-in user's own email address
 */
router.get('/inbox', mailController.myInbox);

/** Delete one message from your own inbox. */
router.delete('/inbox/:mailId', mailController.deleteInboxMail);

/** Hospital-management accounts this user may write to. */
router.get('/admins', mailController.listAdmins);

/** Send a message to hospital management (Notifications + inbox for the admin). */
router.post('/contact', validate(contactAdminSchema), mailController.contactAdmin);

export default router;
