-- psql quotes snapshot literals safely. Nothing is written to migration history.
SELECT
  (SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(m) ORDER BY m.id)
   FROM "task04_test"."_prisma_migrations" m) = :'task04_history_snapshot'::JSONB
  AND
  (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array("id","emailCanonical","createdAt") ORDER BY "id")
   FROM "task04_test"."User") = :'task04_identity_snapshot'::JSONB
  AS task04_preserved
\gset
\if :task04_preserved
\echo Full migration history/diagnostic and original user identities are unchanged.
\else
DO LANGUAGE plpgsql $changed$ BEGIN RAISE EXCEPTION 'History or original user identity changed; stop'; END; $changed$;
\endif
