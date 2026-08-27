CREATE TYPE "public"."media_kind" AS ENUM('image', 'video');--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "media_kind" NOT NULL,
	"width" integer,
	"height" integer,
	"duration_ms" integer,
	"directory" text NOT NULL,
	"variants" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_media_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_poster_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "background_media_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "background_overlay" numeric(3, 2) DEFAULT '0.40' NOT NULL;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_user_idx" ON "media" USING btree ("user_id");