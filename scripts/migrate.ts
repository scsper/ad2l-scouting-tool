import { fileURLToPath } from "node:url"
import pg from "pg"
import {
  loadMigrations,
  migrationDatabaseUrl,
  runMigrations,
  type AppliedMigration,
} from "./migration-runner.js"

async function main() {
  const args = process.argv.slice(2)
  if (args.length > 1 || (args.length === 1 && args[0] !== "--deployment")) {
    throw new Error("Usage: npm run db:migrate [-- --deployment]")
  }
  const connectionString = migrationDatabaseUrl(
    process.env,
    args.includes("--deployment"),
  )
  if (connectionString === null) {
    console.log("Automatic migrations run only on production deployments.")
    return
  }

  const migrations = await loadMigrations(
    fileURLToPath(new URL("../migrations/", import.meta.url)),
  )
  const client = new pg.Client({
    connectionString,
    connectionTimeoutMillis: 15_000,
    application_name: "ad2l-migrations",
  })
  try {
    await client.connect()
    const applied = await runMigrations(
      {
        query: (sql, values) => client.query<AppliedMigration>(sql, values),
      },
      migrations,
    )
    for (const name of applied) console.log(`Applied ${name}`)
    console.log(
      applied.length === 0
        ? "Database migrations are up to date."
        : "Database migrations complete.",
    )
  } finally {
    await client.end()
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error"
  const connectionString = process.env.DATABASE_URL
  console.error(
    "Migrations failed:",
    connectionString
      ? message.replaceAll(connectionString, "[redacted]")
      : message,
  )
  process.exitCode = 1
})
