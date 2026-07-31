import { ParseError, parseMatch } from "../api/lib/match-operations"

// to run: tsx scripts/parse-match.ts <matchId> [--overwrite]
function getMatchIdFromCommandLine(): number {
  const matchIdArg = process.argv[2]

  if (!matchIdArg) {
    console.error("Error: Match ID is required")
    console.log("Usage: tsx parse-match.ts <matchId> [--overwrite]")
    process.exit(1)
  }

  const matchId = parseInt(matchIdArg, 10)

  if (isNaN(matchId)) {
    console.error(`Error: Invalid match ID "${matchIdArg}". Must be a number.`)
    process.exit(1)
  }

  return matchId
}

async function main() {
  const matchId = getMatchIdFromCommandLine()
  const overwrite = process.argv.includes("--overwrite")

  try {
    const result = await parseMatch({ matchId, overwrite })
    console.log(`${result.status}: match ${String(result.matchId)}`)
    result.warnings.forEach(warning => {
      console.warn(`  warning: ${warning}`)
    })
  } catch (error) {
    if (error instanceof ParseError) {
      console.error(`${error.code}: ${error.message}`)
      process.exit(1)
    }
    throw error
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
