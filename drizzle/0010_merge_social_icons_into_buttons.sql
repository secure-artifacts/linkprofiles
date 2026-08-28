CREATE TYPE "public"."button_kind" AS ENUM('link', 'social');--> statement-breakpoint

ALTER TABLE "buttons" ADD COLUMN "kind" "button_kind";--> statement-breakpoint
ALTER TABLE "buttons" ADD COLUMN "platform" text;--> statement-breakpoint
ALTER TABLE "buttons" ADD COLUMN "value" text;--> statement-breakpoint
ALTER TABLE "buttons" ADD COLUMN "solid_background" boolean;--> statement-breakpoint

ALTER TABLE "buttons" ALTER COLUMN "url" DROP NOT NULL;--> statement-breakpoint

UPDATE "buttons" SET "kind" = 'link';--> statement-breakpoint

INSERT INTO "buttons"
  ("id", "profile_id", "kind", "title", "subtitle", "url",
   "platform", "value", "position", "is_lead", "pass_source", "created_at", "updated_at")
SELECT
  "id", "profile_id", 'social',
  CASE "platform"
    WHEN 'whatsapp'  THEN 'WhatsApp'
    WHEN 'messenger' THEN 'Messenger'
    WHEN 'telegram'  THEN 'Telegram'
    WHEN 'signal'    THEN 'Signal'
    WHEN 'email'     THEN 'Email'
    WHEN 'instagram' THEN 'Instagram'
    WHEN 'facebook'  THEN 'Facebook'
    WHEN 'youtube'   THEN 'YouTube'
    WHEN 'tiktok'    THEN 'TikTok'
    WHEN 'x'         THEN 'X'
    WHEN 'threads'   THEN 'Threads'
    WHEN 'snapchat'  THEN 'Snapchat'
    WHEN 'linkedin'  THEN 'LinkedIn'
    WHEN 'pinterest' THEN 'Pinterest'
    ELSE "platform"
  END,
  '', NULL,
  "platform", "value", "position", "is_lead", "pass_source", "created_at", "updated_at"
FROM "social_icons";--> statement-breakpoint

UPDATE "buttons" SET "solid_background" = "is_lead";--> statement-breakpoint

WITH ranked AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "profile_id"
      ORDER BY CASE "kind" WHEN 'social' THEN 0 ELSE 1 END, "position", "created_at", "id"
    ) - 1 AS new_position
  FROM "buttons"
)
UPDATE "buttons"
SET "position" = ranked.new_position
FROM ranked
WHERE "buttons"."id" = ranked."id";--> statement-breakpoint

DO $$
DECLARE
  social_count bigint;
  merged_count bigint;
  bad_shape bigint;
  bad_visual bigint;
  bad_position bigint;
BEGIN
  SELECT count(*) INTO social_count FROM "social_icons";
  SELECT count(*) INTO merged_count FROM "buttons" WHERE "kind" = 'social';
  IF social_count <> merged_count THEN
    RAISE EXCEPTION '社媒行数对不上：social_icons=% buttons(kind=social)=%', social_count, merged_count;
  END IF;

  IF EXISTS (
    SELECT 1 FROM "social_icons" s
    LEFT JOIN "buttons" b ON b."id" = s."id" AND b."kind" = 'social'
    WHERE b."id" IS NULL
       OR b."profile_id" IS DISTINCT FROM s."profile_id"
       OR b."platform"   IS DISTINCT FROM s."platform"
       OR b."value"      IS DISTINCT FROM s."value"
       OR b."is_lead"    IS DISTINCT FROM s."is_lead"
       OR b."pass_source" IS DISTINCT FROM s."pass_source"
  ) THEN
    RAISE EXCEPTION '有社媒行没被原样搬过来';
  END IF;

  SELECT count(*) INTO bad_shape FROM "buttons"
  WHERE NOT (
    ("kind" = 'link'   AND "url" IS NOT NULL AND "platform" IS NULL     AND "value" IS NULL)
    OR
    ("kind" = 'social' AND "url" IS NULL     AND "platform" IS NOT NULL AND "value" IS NOT NULL)
  );
  IF bad_shape > 0 THEN
    RAISE EXCEPTION '有 % 行不满足 kind 与 url/platform/value 的形状约束', bad_shape;
  END IF;

  SELECT count(*) INTO bad_visual FROM "buttons" WHERE "solid_background" IS DISTINCT FROM "is_lead";
  IF bad_visual > 0 THEN
    RAISE EXCEPTION '有 % 行 solid_background 没按 is_lead 回填', bad_visual;
  END IF;

  SELECT count(*) INTO bad_position FROM (
    SELECT "position",
           row_number() OVER (PARTITION BY "profile_id" ORDER BY "position") - 1 AS expected
    FROM "buttons"
  ) t WHERE "position" <> expected;
  IF bad_position > 0 THEN
    RAISE EXCEPTION '有 % 行 position 重排后不连续', bad_position;
  END IF;
END $$;--> statement-breakpoint

ALTER TABLE "buttons" ALTER COLUMN "kind" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "buttons" ALTER COLUMN "solid_background" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "buttons" ALTER COLUMN "solid_background" SET DEFAULT false;--> statement-breakpoint

ALTER TABLE "buttons" ADD CONSTRAINT "buttons_kind_shape_chk" CHECK (("buttons"."kind" = 'link' AND "buttons"."url" IS NOT NULL AND "buttons"."platform" IS NULL AND "buttons"."value" IS NULL)
          OR ("buttons"."kind" = 'social' AND "buttons"."url" IS NULL AND "buttons"."platform" IS NOT NULL AND "buttons"."value" IS NOT NULL));--> statement-breakpoint

DROP TABLE "social_icons" CASCADE;
