-- Adds an optional admin profile-picture URL (falls back to initials when null).
ALTER TABLE "User" ADD COLUMN "avatarUrl" TEXT;
