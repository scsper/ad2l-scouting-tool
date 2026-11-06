## Scripts

- `start` - start dev server and open browser. allows serverless routes to work by running `vercel dev`
- `build` - build for production
- `build:deploy` - run deployment migrations, then build (Vercel runs this automatically)
- `db:migrate` - apply pending migrations to `DATABASE_URL`
- `preview` - locally preview production build
- `test` - launch test runner
- `backfill-camps-stacked -- --db` - fill missing jungle camp stack counts for
  existing games from OpenDota. Run after the migration, with `SUPABASE_DOTA2_URL` and
  `SUPABASE_DOTA2_SECRET_KEY` set. Unavailable counts display as “—” in the UI.
- `backfill-ward-kills -- --db` - fill raw OpenDota ward last-hit counts.
- `backfill-dewards -- --db` - fill observer and sentry deward credit from local
  replay archives after the `add_deward_credit.sql` migration. Credits the
  player who provided True Sight (usually the sentry placer), using Dota's
  recorded attribution. Both Players and league stats use this credit.
  Add `--dry-run` to preview; this also works before the migration. Requires
  the same Supabase environment variables as other backfills. Archives default
  to `~/dota-replay-archive` (override with `REPLAY_ARCHIVE_DIR`). Missing
  archives remain unknown and display as “—”; raw last hits are never used as
  a fallback. New `parse-replays` runs fill this credit automatically; already
  processed matches need this backfill or `parse-replays --from-archive`.
- `grant` - add an admin or a division-scoped user, or revoke access. `npm run grant -- --list`
  shows who has what; see `.claude/skills/grant-access/SKILL.md` for the full runbook.

## Database migrations

Vercel runs pending migrations before each **production** build. A missing
connection string or failed migration stops the deployment. Preview and custom
environments skip automatic migrations; `npm run build` also stays database-free.

One-time setup in Vercel's project settings:

1. Add `DATABASE_URL` for the **Production** environment. Use the Postgres
   connection URI from Supabase's **Connect** dialog, with a database password.
   The existing Supabase API URL and service key cannot execute SQL migrations.
   A [session pooler connection](https://supabase.com/docs/guides/database/connecting-to-postgres)
   on port 5432 works with IPv4 build hosts. Use
   `sslmode=verify-full&sslrootcert=certs/supabase-ca.crt` in the URI so the
   connection verifies Supabase's certificate using the bundled public CA.
   The CA comes from [Supabase's certificate download](https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt);
   see the [SSL configuration guide](https://supabase.com/docs/guides/platform/ssl-enforcement).
2. Keep **Automatically expose System Environment Variables** enabled so the
   runner can identify the production deployment.

To run migrations locally, add `DATABASE_URL` to `.env.local`, then run:

```sh
node --env-file=.env.local --import tsx scripts/migrate.ts
```

Add future SQL files to `migrations/` and append their filenames to
`migrations/manifest.json` in execution order. Only listed files run. The first
managed migration is `add_camps_stacked.sql`; older files are manual history,
including already-applied changes and deferred cleanup, and are deliberately
excluded. This is an upgrade runner for an existing database, not a schema
bootstrap for an empty database.

The runner records filenames and checksums in `app_migrations.applied`, serializes
concurrent deployments with a database lock, and commits pending SQL and history
in one transaction. Keep applied files unchanged; corrections need a new file.
Migration SQL must run inside a transaction, without its own `BEGIN`/`COMMIT` or
commands such as `CREATE INDEX CONCURRENTLY`.

Use changes compatible with the currently deployed app: the migration commits
before the build, and a later build failure or app rollback does not undo it.
Long OpenDota backfills remain separate commands; they do not block deployments.

## Helpful Tidbits
#### Sql to remove a match from the database
```
BEGIN TRANSACTION;

DELETE FROM match_player WHERE match_id = 8669782562;
DELETE FROM match_draft WHERE match_id = 8669782562;
DELETE FROM match WHERE id = 8669782562;

COMMIT;
```
