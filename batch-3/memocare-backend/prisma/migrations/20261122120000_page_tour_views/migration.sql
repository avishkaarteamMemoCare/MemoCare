-- CreateTable
CREATE TABLE "PageTourView" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pageKey" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageTourView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PageTourView_userId_pageKey_key" ON "PageTourView"("userId", "pageKey");

-- CreateIndex
CREATE INDEX "PageTourView_userId_idx" ON "PageTourView"("userId");

-- AddForeignKey
ALTER TABLE "PageTourView" ADD CONSTRAINT "PageTourView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
