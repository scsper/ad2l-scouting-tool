import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

export type Migration = {
  name: string
  sql: string
  sha256: string
}

export type AppliedMigration = Pick<Migration, "name" | "sha256">

export type MigrationDatabase = {
  query: (
    sql: string,
    values?: string[],
  ) => Promise<{ rows: AppliedMigration[] }>
}

/** Ordinary local builds and preview deployments must not migrate production. */
export function migrationDatabaseUrl(
  env: NodeJS.ProcessEnv,
  deployment: boolean,
): string | null {
  if (deployment) {
    const target = env.VERCEL_TARGET_ENV ?? env.VERCEL_ENV
    if (!target) {
      throw new Error(
        "Deployment environment is missing. Enable Vercel's system environment variables.",
      )
    }
    if (target !== "production") return null
  }
  if (!env.DATABASE_URL) {
    throw new Error(
      "Set DATABASE_URL to the Postgres connection string before running migrations.",
    )
  }
  return env.DATABASE_URL
}

/** Only listed files run: the older SQL files are manual migration history. */
export async function loadMigrations(directory: string): Promise<Migration[]> {
  const names: unknown = JSON.parse(
    await readFile(join(directory, "manifest.json"), "utf8"),
  )
  if (
    !Array.isArray(names) ||
    !names.every(
      (name: unknown): name is string =>
        typeof name === "string" && /^[a-z0-9][a-z0-9_-]*\.sql$/.test(name),
    ) ||
    new Set(names).size !== names.length
  ) {
    throw new Error(
      "Migration manifest must list unique SQL filenames in order.",
    )
  }

  return Promise.all(
    names.map(async name => {
      const sql = await readFile(join(directory, name), "utf8")
      if (!sql.trim()) throw new Error(`Migration ${name} is empty.`)
      return {
        name,
        sql,
        sha256: createHash("sha256").update(sql).digest("hex"),
      }
    }),
  )
}

/** Apply the batch and its history atomically using one database connection. */
export async function runMigrations(
  db: MigrationDatabase,
  migrations: Migration[],
): Promise<string[]> {
  await db.query("BEGIN")
  try {
    await db.query("SET LOCAL lock_timeout = '60s'")
    await db.query("SET LOCAL statement_timeout = '5min'")
    // Stable application lock, released on commit/rollback. Concurrent builds
    // wait here, then re-read history before deciding which files remain.
    await db.query("SELECT pg_advisory_xact_lock(1094988364, 1)")
    // Keep deployment metadata outside Supabase's exposed public schema.
    await db.query("CREATE SCHEMA IF NOT EXISTS app_migrations")
    await db.query(`CREATE TABLE IF NOT EXISTS app_migrations.applied (
      name TEXT PRIMARY KEY,
      sha256 TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`)
    const { rows } = await db.query(
      "SELECT name, sha256 FROM app_migrations.applied",
    )
    const applied = new Map(rows.map(row => [row.name, row.sha256]))

    for (const migration of migrations) {
      if (
        applied.has(migration.name) &&
        applied.get(migration.name) !== migration.sha256
      ) {
        throw new Error(
          `Applied migration ${migration.name} has changed. Add a new migration instead.`,
        )
      }
    }

    const pending = migrations.filter(migration => !applied.has(migration.name))
    for (const migration of pending) {
      await db.query(migration.sql)
      await db.query(
        "INSERT INTO app_migrations.applied (name, sha256) VALUES ($1, $2)",
        [migration.name, migration.sha256],
      )
    }
    await db.query("COMMIT")
    return pending.map(migration => migration.name)
  } catch (error) {
    await db.query("ROLLBACK")
    throw error
  }
}
