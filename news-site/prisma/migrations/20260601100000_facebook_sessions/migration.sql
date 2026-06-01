-- Encrypted backup of a logged-in browser session (Playwright storageState) for the self-hosted fb-runner.
-- CreateTable
CREATE TABLE "FacebookSession" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "accountName" TEXT,
    "encryptedState" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "lastUsedAt" TIMESTAMP(3),
    "lastValidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacebookSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FacebookSession_status_idx" ON "FacebookSession"("status");
