-- Source of an article's cover image ("Pexels" | "Unsplash" | "Pixabay" |
-- "Wikimedia Commons") so the credit line under the hero is source-accurate.
-- Additive + nullable; legacy/manual covers stay null.
ALTER TABLE "Article" ADD COLUMN "coverImageSource" TEXT;
