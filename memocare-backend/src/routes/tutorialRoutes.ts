import { Router } from 'express';
import * as tutorialController from '../controllers/tutorialController';
import { authenticate, authenticateOptional } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import {
  createTutorialSchema,
  updateTutorialSchema,
  markPageTourSeenSchema,
} from '../validators/tutorialValidators';

const router = Router();

// Public-ish read access (optional auth so admins could see drafts later
// if we extend this); listing/detail don't require login today per spec
// ("serve tutorial content"), but completion tracking does.

/**
 * @openapi
 * /tutorials:
 *   get:
 *     tags: [Tutorials]
 *     summary: List published tutorial articles
 *     security: []
 *     responses:
 *       '200': { description: List of tutorials }
 *   post:
 *     tags: [Tutorials]
 *     summary: Create a tutorial article (admin only)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [slug, title, bodyMarkdown]
 *             properties:
 *               slug: { type: string, example: understanding-early-signs, description: lowercase, alphanumeric, hyphenated }
 *               title: { type: string, example: Understanding Early Signs of Memory Loss }
 *               bodyMarkdown: { type: string, example: "## Overview\nThis article covers..." }
 *               videoKey: { type: string }
 *               order: { type: integer, example: 1 }
 *               isPublished: { type: boolean, example: true }
 *     responses:
 *       '201': { description: Tutorial created }
 */
router.get('/', authenticateOptional, tutorialController.listTutorials);
router.post('/', authenticate, requireRole('ADMIN'), validate(createTutorialSchema), tutorialController.createTutorial);

/**
 * @openapi
 * /tutorials/progress/me:
 *   get:
 *     tags: [Tutorials]
 *     summary: Get the current user's tutorial completion progress
 *     responses:
 *       '200': { description: List of completed tutorials }
 */
router.get('/progress/me', authenticate, tutorialController.getMyProgress);

/**
 * @openapi
 * /tutorials/page-tours:
 *   get:
 *     tags: [Tutorials]
 *     summary: Sidebar page keys whose one-time tutorial this user has already seen
 *     responses:
 *       '200': { description: "{ seen: string[] }" }
 *   post:
 *     tags: [Tutorials]
 *     summary: Mark a sidebar page's tutorial as seen (it is never shown again)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [pageKey]
 *             properties:
 *               pageKey: { type: string, example: "/patients" }
 *     responses:
 *       '200': { description: Seen state recorded }
 */
router.get('/page-tours', authenticate, tutorialController.listSeenPageTours);
router.post(
  '/page-tours',
  authenticate,
  validate(markPageTourSeenSchema),
  tutorialController.markPageTourSeen
);

/**
 * @openapi
 * /tutorials/{slug}:
 *   get:
 *     tags: [Tutorials]
 *     summary: Get a tutorial article by slug
 *     security: []
 *     parameters:
 *       - name: slug
 *         in: path
 *         required: true
 *         schema: { type: string, example: understanding-early-signs }
 *     responses:
 *       '200': { description: Tutorial content }
 *       '404': { description: Not found }
 */
router.get('/:slug', authenticateOptional, tutorialController.getTutorial);

/**
 * @openapi
 * /tutorials/{articleId}/complete:
 *   post:
 *     tags: [Tutorials]
 *     summary: Mark a tutorial article as completed by the current user
 *     parameters:
 *       - name: articleId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       '200': { description: Progress recorded }
 */
router.post('/:articleId/complete', authenticate, tutorialController.completeTutorial);

/**
 * @openapi
 * /tutorials/{id}:
 *   patch:
 *     tags: [Tutorials]
 *     summary: Update a tutorial article (admin only)
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *               bodyMarkdown: { type: string }
 *               videoKey: { type: string }
 *               order: { type: integer }
 *               isPublished: { type: boolean }
 *     responses:
 *       '200': { description: Tutorial updated }
 *   delete:
 *     tags: [Tutorials]
 *     summary: Delete a tutorial article (admin only)
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       '204': { description: Tutorial deleted }
 */
router.patch('/:id', authenticate, requireRole('ADMIN'), validate(updateTutorialSchema), tutorialController.updateTutorial);
router.delete('/:id', authenticate, requireRole('ADMIN'), tutorialController.deleteTutorial);

export default router;
