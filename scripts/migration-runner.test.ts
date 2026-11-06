import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  loadMigrations,
  migrationDatabaseUrl,
  runMigrations,
  type AppliedMigration,
  type Migration,
  type MigrationDatabase,
} from "./migration-runner"

const DATABASE_URL = "postgresql://localhost/migration_test"

describe("deployment migration configuration", () => {
  it("requires database credentials for production", () => {
    expect(() =>
      migrationDatabaseUrl({ VERCEL_ENV: "production" }, true),
    ).toThrow("Set DATABASE_URL")
    expect(
      migrationDatabaseUrl({ VERCEL_ENV: "production", DATABASE_URL }, true),
    ).toBe(DATABASE_URL)
  })

  it.each(["preview", "development", "staging"])(
    "skips %s even when it has production credentials",
    VERCEL_TARGET_ENV => {
      expect(
        migrationDatabaseUrl({ VERCEL_TARGET_ENV, DATABASE_URL }, true),
      ).toBeNull()
    },
  )

  it("uses the custom target environment ahead of VERCEL_ENV", () => {
    expect(
      migrationDatabaseUrl(
        {
          VERCEL_TARGET_ENV: "staging",
          VERCEL_ENV: "production",
          DATABASE_URL,
        },
        true,
      ),
    ).toBeNull()
  })

  it("fails if deployment environment detection is unavailable", () => {
    expect(() => migrationDatabaseUrl({ DATABASE_URL }, true)).toThrow(
      "Deployment environment is missing",
    )
  })

  it("allows an explicit local migration but requires its connection string", () => {
    expect(migrationDatabaseUrl({ DATABASE_URL }, false)).toBe(DATABASE_URL)
    expect(() => migrationDatabaseUrl({}, false)).toThrow("Set DATABASE_URL")
  })
})

describe("migration manifest", () => {
  const directories: string[] = []
  afterEach(async () => {
    await Promise.all(
      directories
        .splice(0)
        .map(dir => rm(dir, { recursive: true, force: true })),
    )
  })

  async function directory(manifest: unknown) {
    const dir = await mkdtemp(join(tmpdir(), "ad2l-migrations-"))
    directories.push(dir)
    await writeFile(join(dir, "manifest.json"), JSON.stringify(manifest))
    return dir
  }

  it("reads only listed files in manifest order and fingerprints their contents", async () => {
    const dir = await directory(["z_first.sql", "a_second.sql"])
    await writeFile(join(dir, "z_first.sql"), "SELECT 1;")
    await writeFile(join(dir, "a_second.sql"), "SELECT 2;")
    await writeFile(join(dir, "old_cleanup.sql"), "DROP TABLE player;")
    const migrations = await loadMigrations(dir)
    expect(migrations.map(migration => migration.name)).toEqual([
      "z_first.sql",
      "a_second.sql",
    ])
    expect(migrations[0].sha256).toMatch(/^[a-f0-9]{64}$/)
    await writeFile(join(dir, "z_first.sql"), "SELECT 3;")
    expect((await loadMigrations(dir))[0].sha256).not.toBe(migrations[0].sha256)
  })

  it.each([
    { manifest: ["duplicate.sql", "duplicate.sql"] },
    { manifest: ["../outside.sql"] },
    { manifest: [123] },
    { manifest: { file: "migration.sql" } },
  ])("rejects an invalid manifest: $manifest", async ({ manifest }) => {
    await expect(loadMigrations(await directory(manifest))).rejects.toThrow(
      "Migration manifest",
    )
  })

  it("fails when a listed migration is missing", async () => {
    await expect(
      loadMigrations(await directory(["missing.sql"])),
    ).rejects.toThrow("ENOENT")
  })
})

describe("migration transactions", () => {
  const first: Migration = {
    name: "first.sql",
    sql: "CREATE TABLE first (id INT)",
    sha256: "first-hash",
  }
  const second: Migration = {
    name: "second.sql",
    sql: "CREATE TABLE second (id INT)",
    sha256: "second-hash",
  }

  function database(applied: AppliedMigration[] = []) {
    return {
      query: vi.fn<MigrationDatabase["query"]>(sql =>
        Promise.resolve({
          rows: sql.startsWith("SELECT name, sha256") ? applied : [],
        }),
      ),
    }
  }

  it("skips completed migrations, runs pending ones in order, and commits history", async () => {
    const db = database([first])
    expect(await runMigrations(db, [first, second])).toEqual([second.name])
    expect(db.query).not.toHaveBeenCalledWith(first.sql)
    expect(db.query).toHaveBeenCalledWith(second.sql)
    expect(db.query).toHaveBeenCalledWith(
      "INSERT INTO app_migrations.applied (name, sha256) VALUES ($1, $2)",
      [second.name, second.sha256],
    )
    const queries = db.query.mock.calls.map(([sql]) => sql)
    expect(
      queries.indexOf("SELECT pg_advisory_xact_lock(1094988364, 1)"),
    ).toBeLessThan(
      queries.indexOf("SELECT name, sha256 FROM app_migrations.applied"),
    )
    expect(db.query).toHaveBeenLastCalledWith("COMMIT")
  })

  it("does not rerun completed migrations", async () => {
    const db = database([first, second])
    expect(await runMigrations(db, [first, second])).toEqual([])
    expect(db.query).not.toHaveBeenCalledWith(first.sql)
    expect(db.query).not.toHaveBeenCalledWith(second.sql)
  })

  it("refuses edits to applied files before running any pending migration", async () => {
    const db = database([{ ...first, sha256: "old-hash" }])
    await expect(runMigrations(db, [second, first])).rejects.toThrow(
      "has changed",
    )
    expect(db.query).not.toHaveBeenCalledWith(second.sql)
    expect(db.query).toHaveBeenLastCalledWith("ROLLBACK")
  })

  it("rolls back the batch when SQL fails", async () => {
    const db = database()
    db.query.mockImplementation(sql =>
      sql === second.sql
        ? Promise.reject(new Error("invalid SQL"))
        : Promise.resolve({ rows: [] }),
    )
    await expect(runMigrations(db, [first, second])).rejects.toThrow(
      "invalid SQL",
    )
    expect(db.query).toHaveBeenLastCalledWith("ROLLBACK")
    expect(db.query).not.toHaveBeenCalledWith("COMMIT")
  })
})
