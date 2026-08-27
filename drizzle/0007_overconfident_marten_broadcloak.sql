CREATE TABLE "daily_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"country" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"device_type" "device_type" DEFAULT 'unknown' NOT NULL,
	"os" text DEFAULT '' NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"page_views" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"leads" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "daily_summaries_bucket_unique" ON "daily_summaries" USING btree ("user_id","day","country","city","device_type","os","source");--> statement-breakpoint
CREATE INDEX "daily_summaries_user_day_idx" ON "daily_summaries" USING btree ("user_id","day");