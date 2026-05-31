-- CreateTable
CREATE TABLE "SavedIdea" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "source" TEXT,
    "image" TEXT,
    "snippet" TEXT,
    "status" TEXT NOT NULL DEFAULT 'idea',
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedIdea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowedTopic" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "lang" TEXT NOT NULL DEFAULT 'en',
    "country" TEXT NOT NULL DEFAULT 'us',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowedTopic_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedIdea_userId_savedAt_idx" ON "SavedIdea"("userId", "savedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SavedIdea_userId_url_key" ON "SavedIdea"("userId", "url");

-- CreateIndex
CREATE INDEX "FollowedTopic_userId_createdAt_idx" ON "FollowedTopic"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FollowedTopic_userId_topic_key" ON "FollowedTopic"("userId", "topic");

-- AddForeignKey
ALTER TABLE "SavedIdea" ADD CONSTRAINT "SavedIdea_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowedTopic" ADD CONSTRAINT "FollowedTopic_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
