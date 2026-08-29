ALTER TYPE "public"."theme" ADD VALUE 'glass-ocean';--> statement-breakpoint
ALTER TYPE "public"."theme" ADD VALUE 'glass-rose';--> statement-breakpoint
ALTER TYPE "public"."theme" ADD VALUE 'glass-aurora';--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "banner_media_id" uuid;--> statement-breakpoint
-- 旧 Banner 页面先保留当前画面；新增槽位后，之后更换头像与 Banner 图互不影响。
UPDATE "profiles" SET "banner_media_id" = "avatar_media_id" WHERE "layout" = 'banner' AND "avatar_media_id" IS NOT NULL;--> statement-breakpoint
-- Cutout 已下线，已有页面平稳迁回最接近且不会遮字的 Classic。
UPDATE "profiles" SET "layout" = 'classic' WHERE "layout" = 'cutout';--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "layout" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "layout" SET DEFAULT 'classic'::text;--> statement-breakpoint
DROP TYPE "public"."layout";--> statement-breakpoint
CREATE TYPE "public"."layout" AS ENUM('classic', 'hero', 'banner', 'shape');--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "layout" SET DEFAULT 'classic'::"public"."layout";--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "layout" SET DATA TYPE "public"."layout" USING "layout"::"public"."layout";
