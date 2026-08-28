ALTER TABLE "profiles" ADD COLUMN "solid_background" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "icon_plate" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "buttons" DROP COLUMN "solid_background";