ALTER TABLE "buttons" ADD COLUMN "direct_message" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "buttons" SET "direct_message" = true WHERE "kind" = 'social' AND "platform" = 'instagram';
