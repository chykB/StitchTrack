-- OWNER ADMIN ONLY. Fresh targets only. Partial failure means STOP, never rerun blindly.
\set ON_ERROR_STOP on
DO $guard$
BEGIN
  IF current_database()<>'postgres' OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper)
    OR current_user<>session_user OR current_setting('server_version_num')::int NOT BETWEEN 160000 AND 169999
    OR current_setting('port')<>'5432'
  THEN RAISE EXCEPTION 'Reviewed local PostgreSQL 16 administrator on postgres required'; END IF;
  IF EXISTS (SELECT 1 FROM pg_database WHERE datname IN ('stitchtrack_product_dev','stitchtrack_product_test'))
    OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('stitchtrack_product_dev_migrator','stitchtrack_product_dev_app','stitchtrack_product_test_migrator','stitchtrack_product_test_app'))
  THEN RAISE EXCEPTION 'Product target or role already exists; inspect before changing anything'; END IF;
END;
$guard$;
BEGIN;
CREATE ROLE stitchtrack_product_dev_migrator LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE stitchtrack_product_dev_app LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE stitchtrack_product_test_migrator LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE stitchtrack_product_test_app LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
COMMIT;
-- CREATE DATABASE cannot run in a transaction. Database owner stays the administrator.
CREATE DATABASE stitchtrack_product_dev TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER libc LC_COLLATE 'C' LC_CTYPE 'C';
CREATE DATABASE stitchtrack_product_test TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER libc LC_COLLATE 'C' LC_CTYPE 'C';
REVOKE ALL ON DATABASE stitchtrack_product_dev FROM PUBLIC;
REVOKE ALL ON DATABASE stitchtrack_product_test FROM PUBLIC;
GRANT CONNECT ON DATABASE stitchtrack_product_dev TO stitchtrack_product_dev_migrator, stitchtrack_product_dev_app;
GRANT CONNECT ON DATABASE stitchtrack_product_test TO stitchtrack_product_test_migrator, stitchtrack_product_test_app;

\connect stitchtrack_product_dev
BEGIN;
CREATE SCHEMA product AUTHORIZATION stitchtrack_product_dev_migrator;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA product FROM PUBLIC;
GRANT USAGE ON SCHEMA product TO stitchtrack_product_dev_app;
ALTER DEFAULT PRIVILEGES FOR ROLE stitchtrack_product_dev_migrator IN SCHEMA product REVOKE ALL ON TABLES FROM PUBLIC;
COMMIT;

\connect stitchtrack_product_test
BEGIN;
CREATE SCHEMA product AUTHORIZATION stitchtrack_product_test_migrator;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA product FROM PUBLIC;
GRANT USAGE ON SCHEMA product TO stitchtrack_product_test_app;
ALTER DEFAULT PRIVILEGES FOR ROLE stitchtrack_product_test_migrator IN SCHEMA product REVOKE ALL ON TABLES FROM PUBLIC;
COMMIT;
-- Passwords are deliberately absent. Set each privately with psql \password.
