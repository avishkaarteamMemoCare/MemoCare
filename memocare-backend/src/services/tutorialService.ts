import { prisma } from '../config/prisma';
import { AppError } from '../utils/errors';

export async function listPublishedTutorials() {
  return prisma.tutorialArticle.findMany({
    where: { isPublished: true },
    orderBy: { order: 'asc' },
  });
}

export async function getTutorialBySlug(slug: string) {
  const article = await prisma.tutorialArticle.findUnique({ where: { slug } });
  if (!article || !article.isPublished) throw AppError.notFound('Tutorial not found');
  return article;
}

export async function markTutorialComplete(userId: string, articleId: string) {
  const article = await prisma.tutorialArticle.findUnique({ where: { id: articleId } });
  if (!article) throw AppError.notFound('Tutorial not found');
  return prisma.tutorialProgress.upsert({
    where: { userId_articleId: { userId, articleId } },
    update: { completedAt: new Date() },
    create: { userId, articleId },
  });
}

export async function getUserProgress(userId: string) {
  const [all, completed] = await Promise.all([
    prisma.tutorialArticle.count({ where: { isPublished: true } }),
    prisma.tutorialProgress.findMany({ where: { userId }, include: { article: true } }),
  ]);
  return {
    totalPublished: all,
    completedCount: completed.length,
    completed,
  };
}

/**
 * Page tours: the one-time walkthrough shown the first time a user opens a
 * sidebar option. Seen state lives in the database, so it is per-user and
 * survives logins, devices and browser storage being cleared.
 */
export async function listSeenPageTours(userId: string): Promise<string[]> {
  const rows = await prisma.pageTourView.findMany({
    where: { userId },
    select: { pageKey: true },
  });
  return rows.map((r) => r.pageKey);
}

export async function markPageTourSeen(userId: string, pageKey: string) {
  return prisma.pageTourView.upsert({
    where: { userId_pageKey: { userId, pageKey } },
    update: { seenAt: new Date() },
    create: { userId, pageKey },
  });
}

// --- Admin CMS operations ---

export async function createTutorial(input: {
  slug: string;
  title: string;
  bodyMarkdown: string;
  videoKey?: string;
  order?: number;
  isPublished?: boolean;
}) {
  return prisma.tutorialArticle.create({ data: input });
}

export async function updateTutorial(id: string, input: Partial<{
  title: string;
  bodyMarkdown: string;
  videoKey: string;
  order: number;
  isPublished: boolean;
}>) {
  const article = await prisma.tutorialArticle.findUnique({ where: { id } });
  if (!article) throw AppError.notFound('Tutorial not found');
  return prisma.tutorialArticle.update({ where: { id }, data: input });
}

export async function deleteTutorial(id: string) {
  const article = await prisma.tutorialArticle.findUnique({ where: { id } });
  if (!article) throw AppError.notFound('Tutorial not found');
  await prisma.tutorialArticle.delete({ where: { id } });
}
