SELECT pg_catalog.current_database() AS database, CURRENT_USER AS role;
SELECT "id","emailCanonical","createdAt","name" FROM "task04_test"."User" ORDER BY "id";
SELECT count(*) AS user_count, count(*) FILTER (WHERE "name" IS NULL) AS null_names FROM "task04_test"."User";
SELECT column_name,data_type,is_nullable,column_default FROM information_schema.columns
WHERE table_schema='task04_test' AND table_name='User' ORDER BY ordinal_position;
SELECT c.conname,c.convalidated,pg_catalog.pg_get_constraintdef(c.oid) AS definition
FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class r ON r.oid=c.conrelid
JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace
WHERE n.nspname='task04_test' AND r.relname='User' ORDER BY c.conname;
SELECT id,migration_name,checksum,started_at,finished_at,rolled_back_at,logs
FROM "task04_test"."_prisma_migrations" ORDER BY started_at;
