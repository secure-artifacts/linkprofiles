CREATE TABLE "account_name_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"changed_by" uuid,
	"from_account" text NOT NULL,
	"to_account" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_name_changes" ADD CONSTRAINT "account_name_changes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "account_name_changes" ADD CONSTRAINT "account_name_changes_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "account_name_changes_user_idx" ON "account_name_changes" USING btree ("user_id","created_at");
--> statement-breakpoint
DROP INDEX "users_account_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "users_account_unique" ON "users" USING btree (lower("account"));
