ALTER TABLE "users" DROP CONSTRAINT "users_owning_admin_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "users_owning_admin_idx";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "owning_admin_id";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_region_matches_role" CHECK (("users"."role" = 'user') = ("users"."region_id" is not null));