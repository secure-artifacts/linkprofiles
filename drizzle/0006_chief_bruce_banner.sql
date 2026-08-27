CREATE TABLE "short_name_tombstones" (
	"short_name" text PRIMARY KEY NOT NULL,
	"former_user_id" uuid NOT NULL,
	"retired_at" timestamp with time zone DEFAULT now() NOT NULL
);
