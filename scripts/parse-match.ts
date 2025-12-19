import { getMatch, convertMatchDataToMatchTable, convertMatchDataToMatchPlayersTable, convertMatchDataToMatchDraftTable } from "./match-operations";
import type { Match } from "./match-operations";

function getMatchIdFromCommandLine(): number {
  const matchIdArg = process.argv[2];

  if (!matchIdArg) {
    console.error("Error: Match ID is required");
    console.log("Usage: tsx parse-match.ts <matchId>");
    process.exit(1);
  }

  const matchId = parseInt(matchIdArg, 10);

  if (isNaN(matchId)) {
    console.error(`Error: Invalid match ID "${matchIdArg}". Must be a number.`);
    process.exit(1);
  }

  return matchId;
}

async function main() {
  // Main execution
  const matchId = getMatchIdFromCommandLine();
  const matchData = await getMatch(matchId);
  convertMatchDataToMatchTable(matchData?.data.match ?? {} as Match).catch(console.error);
  convertMatchDataToMatchPlayersTable(matchData?.data.match ?? {} as Match).catch(console.error);
  convertMatchDataToMatchDraftTable(matchData?.data.match ?? {} as Match).catch(console.error);
  // console.log(JSON.stringify(matchData, null, 2));
}

main().catch(console.error);
