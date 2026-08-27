CREATE TABLE "settings" (
	"id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"source_passthrough_default" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
