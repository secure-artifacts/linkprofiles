ALTER TABLE "settings" ADD COLUMN "recaptcha_site_key" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "recaptcha_secret_key" text DEFAULT '' NOT NULL;