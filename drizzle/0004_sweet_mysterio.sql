CREATE TYPE "public"."click_target" AS ENUM('button', 'social');--> statement-breakpoint
CREATE TYPE "public"."device_type" AS ENUM('mobile', 'tablet', 'desktop', 'unknown');--> statement-breakpoint
CREATE TABLE "clicks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"target_kind" "click_target" NOT NULL,
	"target_id" uuid NOT NULL,
	"is_lead" boolean NOT NULL,
	"country" text,
	"city" text,
	"device_type" "device_type" DEFAULT 'unknown' NOT NULL,
	"os" text,
	"source" text,
	"ip_truncated" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"country" text,
	"city" text,
	"device_type" "device_type" DEFAULT 'unknown' NOT NULL,
	"os" text,
	"source" text,
	"ip_truncated" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "clicks_user_time_idx" ON "clicks" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "clicks_target_idx" ON "clicks" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "clicks_time_idx" ON "clicks" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "page_views_user_time_idx" ON "page_views" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "page_views_time_idx" ON "page_views" USING btree ("occurred_at");