CREATE TABLE "regions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"owner_admin_id" uuid,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "region_id" uuid;--> statement-breakpoint
ALTER TABLE "regions" ADD CONSTRAINT "regions_owner_admin_id_users_id_fk" FOREIGN KEY ("owner_admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "regions_name_unique" ON "regions" USING btree ("name");--> statement-breakpoint
CREATE INDEX "regions_owner_idx" ON "regions" USING btree ("owner_admin_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_region_idx" ON "users" USING btree ("region_id");--> statement-breakpoint
INSERT INTO "regions" ("id", "name", "owner_admin_id", "is_default")
VALUES ('00000000-0000-4000-8000-000000000001', '未分配', NULL, false);--> statement-breakpoint
DO $mig$
DECLARE
	rec record;
	base text;
	candidate text;
	n int;
BEGIN
	FOR rec IN
		SELECT u."id" AS admin_id,
		       coalesce(nullif(btrim(u."label"), ''), u."account") AS nm
		FROM "users" u
		WHERE u."role" = 'admin'
		ORDER BY u."created_at", u."id"
	LOOP
		base := rec.nm;
		n := 1;
		-- 逐个试到一个没被占的名字为止。不能只在同名分组内报数：分组算出来的
		-- 「foo 2」可能正好是另一个管理员字面上就叫的名字，那样整次迁移会撞
		-- regions_name_unique 回滚，生产库卡在上一版。
		LOOP
			candidate := CASE WHEN n = 1 THEN base ELSE base || ' ' || n END;
			EXIT WHEN NOT EXISTS (SELECT 1 FROM "regions" WHERE "name" = candidate);
			n := n + 1;
		END LOOP;

		INSERT INTO "regions" ("name", "owner_admin_id", "is_default")
		VALUES (candidate, rec.admin_id, true);
	END LOOP;
END
$mig$;--> statement-breakpoint
UPDATE "users" u
SET "region_id" = r."id"
FROM "regions" r
WHERE u."role" = 'user'
  AND u."owning_admin_id" IS NOT NULL
  AND r."owner_admin_id" = u."owning_admin_id"
  AND r."is_default" = true;--> statement-breakpoint
UPDATE "users"
SET "region_id" = '00000000-0000-4000-8000-000000000001'::uuid
WHERE "role" = 'user' AND "region_id" IS NULL;
