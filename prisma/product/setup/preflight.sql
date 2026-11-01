-- OWNER ONLY. Catalog/history reads; no application rows or password hashes.
\set ON_ERROR_STOP on
BEGIN READ ONLY;
DO $guard$
BEGIN
  IF current_database() NOT IN ('postgres', 'stitchtrack_product_dev', 'stitchtrack_product_test')
    OR current_setting('server_version_num')::int NOT BETWEEN 160000 AND 169999
    OR current_setting('port') <> '5432'
  THEN RAISE EXCEPTION 'Expected local PostgreSQL 16 product setup target'; END IF;
END;
$guard$;
SELECT current_database() AS database, current_user AS inspector, current_setting('server_version') AS version, current_setting('hba_file') AS authentication_file;
SELECT d.datname, pg_get_userbyid(d.datdba) AS owner, pg_encoding_to_char(d.encoding) AS encoding, d.datcollate, d.datctype
FROM pg_database d WHERE d.datname IN ('stitchtrack_product_dev', 'stitchtrack_product_test') ORDER BY d.datname;
SELECT rolname, rolcanlogin, rolinherit, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
FROM pg_roles WHERE rolname IN ('stitchtrack_product_dev_migrator', 'stitchtrack_product_dev_app', 'stitchtrack_product_test_migrator', 'stitchtrack_product_test_app') ORDER BY rolname;
SELECT member.rolname AS member, parent.rolname AS granted_role
FROM pg_auth_members m JOIN pg_roles member ON member.oid=m.member JOIN pg_roles parent ON parent.oid=m.roleid
WHERE member.rolname IN ('stitchtrack_product_dev_migrator', 'stitchtrack_product_dev_app', 'stitchtrack_product_test_migrator', 'stitchtrack_product_test_app');
SELECT line_number, type, database, user_name, address, auth_method, (error IS NOT NULL) AS invalid_rule FROM pg_hba_file_rules ORDER BY line_number;
SELECT current_database() IN ('stitchtrack_product_dev', 'stitchtrack_product_test') AS inspect_product \gset
\if :inspect_product
SELECT nspname, pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname IN ('product', 'public') ORDER BY nspname;
SELECT n.nspname, c.relname, pg_get_userbyid(c.relowner) AS owner
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE (n.nspname='product' AND c.relkind IN ('r','p')) OR c.relname='_prisma_migrations' ORDER BY n.nspname,c.relname;
-- Execute only this fixed SELECT when the tracking table exists; no history edits.
SELECT 'SELECT migration_name, checksum, started_at, finished_at, rolled_back_at, applied_steps_count FROM product._prisma_migrations ORDER BY started_at;'
WHERE to_regclass('product._prisma_migrations') IS NOT NULL \gexec
SELECT r.rolname, c.relname, has_table_privilege(r.oid,c.oid,'SELECT') AS can_select,
  has_table_privilege(r.oid,c.oid,'INSERT') AS can_insert,
  has_any_column_privilege(r.oid,c.oid,'INSERT') AS can_insert_any_column,
  has_any_column_privilege(r.oid,c.oid,'UPDATE') AS can_update_any_column,
  has_table_privilege(r.oid,c.oid,'DELETE') AS can_delete
FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='product' AND c.relkind='r' AND r.rolname =
  CASE current_database() WHEN 'stitchtrack_product_test' THEN 'stitchtrack_product_test_app' ELSE 'stitchtrack_product_dev_app' END
ORDER BY c.relname;
\endif
COMMIT;
