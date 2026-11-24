-- Admin-configured SMTP account and a log of real delivery attempts.
CREATE TABLE "MailSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 587,
    "secure" BOOLEAN NOT NULL DEFAULT false,
    "username" TEXT NOT NULL DEFAULT '',
    "passwordEnc" TEXT NOT NULL,
    "fromName" TEXT NOT NULL DEFAULT 'MemoCare',
    "fromEmail" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SentEmail" (
    "id" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "tag" TEXT,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "sentById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SentEmail_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SentEmail_createdAt_idx" ON "SentEmail"("createdAt");
CREATE INDEX "SentEmail_status_idx" ON "SentEmail"("status");