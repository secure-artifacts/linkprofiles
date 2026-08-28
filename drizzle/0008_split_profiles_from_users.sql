CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"short_name" text NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"layout" "layout" DEFAULT 'classic' NOT NULL,
	"theme" "theme" DEFAULT 'dawn' NOT NULL,
	"avatar_media_id" uuid,
	"avatar_poster_id" uuid,
	"background_media_id" uuid,
	"background_overlay" numeric(3, 2) DEFAULT '0.40' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "profiles" (
	"id", "user_id", "short_name", "display_name", "bio",
	"layout", "theme", "avatar_media_id", "avatar_poster_id",
	"background_media_id", "background_overlay", "created_at", "updated_at"
)
SELECT
	"id", "id", "short_name", "display_name", "bio",
	"layout", "theme", "avatar_media_id", "avatar_poster_id",
	"background_media_id", "background_overlay", "created_at", "updated_at"
FROM "users"
WHERE "short_name" IS NOT NULL;--> statement-breakpoint
DO $$
DECLARE
	migrated_count bigint;
	source_count bigint;
BEGIN
	SELECT count(*) INTO migrated_count FROM "profiles";
	SELECT count(*) INTO source_count FROM "users" WHERE "short_name" IS NOT NULL;
	IF migrated_count <> source_count THEN
		RAISE EXCEPTION '迁移行数不一致：profiles=% users(short_name 非空)=%', migrated_count, source_count;
	END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_short_name_unique" ON "profiles" USING btree ("short_name");--> statement-breakpoint
CREATE INDEX "profiles_user_idx" ON "profiles" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "buttons" DROP CONSTRAINT "buttons_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "buttons" RENAME COLUMN "user_id" TO "profile_id";--> statement-breakpoint
ALTER TABLE "buttons" ADD CONSTRAINT "buttons_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER INDEX "buttons_user_position_idx" RENAME TO "buttons_profile_position_idx";--> statement-breakpoint
ALTER TABLE "social_icons" DROP CONSTRAINT "social_icons_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "social_icons" RENAME COLUMN "user_id" TO "profile_id";--> statement-breakpoint
ALTER TABLE "social_icons" ADD CONSTRAINT "social_icons_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER INDEX "social_icons_user_position_idx" RENAME TO "social_icons_profile_position_idx";--> statement-breakpoint
ALTER TABLE "media" DROP CONSTRAINT "media_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "media" RENAME COLUMN "user_id" TO "profile_id";--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER INDEX "media_user_idx" RENAME TO "media_profile_idx";--> statement-breakpoint
ALTER TABLE "page_views" RENAME COLUMN "user_id" TO "profile_id";--> statement-breakpoint
ALTER INDEX "page_views_user_time_idx" RENAME TO "page_views_profile_time_idx";--> statement-breakpoint
ALTER TABLE "clicks" RENAME COLUMN "user_id" TO "profile_id";--> statement-breakpoint
ALTER INDEX "clicks_user_time_idx" RENAME TO "clicks_profile_time_idx";--> statement-breakpoint
ALTER TABLE "daily_summaries" RENAME COLUMN "user_id" TO "profile_id";--> statement-breakpoint
ALTER INDEX "daily_summaries_bucket_unique" RENAME TO "daily_summaries_profile_bucket_unique";--> statement-breakpoint
ALTER INDEX "daily_summaries_user_day_idx" RENAME TO "daily_summaries_profile_day_idx";--> statement-breakpoint
ALTER TABLE "short_name_tombstones" RENAME COLUMN "former_user_id" TO "former_profile_id";--> statement-breakpoint
DROP INDEX "users_short_name_unique";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "short_name";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "display_name";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "bio";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "layout";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "theme";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "avatar_media_id";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "avatar_poster_id";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "background_media_id";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "background_overlay";
