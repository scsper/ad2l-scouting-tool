import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { ParseError, parseMatch } from "../api/lib/match-operations"

// Get the directory of the current script
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function getMatchIdsFromFile(): number[] {
  const filePath = path.join(__dirname, "match-ids-to-parse.txt")
  const matchIds = fs.readFileSync(filePath, "utf8")
  return matchIds
    .split("\n")
    .map(line => line.trim())
    .filter(line => line !== "")
    .map(Number)
}

// to run: tsx parse-matches.ts [--overwrite]
// it will read all match ids from match-ids-to-parse.txt and parse them
//
// One failing match no longer aborts the run, but it is reported and the script
// exits non-zero — previously each step swallowed its own error and kept going,
// which turned a duplicate match into duplicated player and draft rows.
async function main() {
  const matchIds = getMatchIdsFromFile()
  const overwrite = process.argv.includes("--overwrite")
  const failures: string[] = []

  for (const matchId of matchIds) {
    try {
      const result = await parseMatch({ matchId, overwrite })
      console.log(`${result.status}: match ${String(result.matchId)}`)
      result.warnings.forEach(warning => {
        console.warn(`  warning: ${warning}`)
      })
    } catch (error) {
      const message =
        error instanceof ParseError
          ? `${error.code}: ${error.message}`
          : String(error)
      console.error(`failed: match ${String(matchId)} — ${message}`)
      failures.push(`${String(matchId)} (${message})`)
    }
  }

  console.log(
    `\nDone. ${String(matchIds.length - failures.length)}/${String(matchIds.length)} succeeded.`,
  )

  if (failures.length > 0) {
    console.error(`Failed:\n  ${failures.join("\n  ")}`)
    process.exit(1)
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
