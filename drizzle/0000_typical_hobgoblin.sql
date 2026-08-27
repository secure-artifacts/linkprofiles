CREATE TYPE "public"."layout" AS ENUM('classic', 'hero', 'banner', 'cutout', 'shape');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('superadmin', 'admin', 'user');--> statement-breakpoint
CREATE TYPE "public"."theme" AS ENUM('dawn', 'harbor', 'moss', 'ember', 'slate', 'nocturne');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" "role" NOT NULL,
	"account" text NOT NULL,
	"password_hash" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"short_name" text,
	"display_name" text DEFAULT '' NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"layout" "layout" DEFAULT 'classic' NOT NULL,
	"theme" "theme" DEFAULT 'dawn' NOT NULL,
	"owning_admin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_owning_admin_id_users_id_fk" FOREIGN KEY ("owning_admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_account_unique" ON "users" USING btree ("account");--> statement-breakpoint
CREATE UNIQUE INDEX "users_short_name_unique" ON "users" USING btree ("short_name");--> statement-breakpoint
CREATE INDEX "users_owning_admin_idx" ON "users" USING btree ("owning_admin_id");