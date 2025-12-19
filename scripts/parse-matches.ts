import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getMatch, convertMatchDataToMatchTable, convertMatchDataToMatchPlayersTable, convertMatchDataToMatchDraftTable } from "./match-operations";
import type { Match } from "./match-operations";

// Get the directory of the current script
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getMatchIdsFromFile(): number[] {
  const filePath = path.join(__dirname, "match-ids-to-parse.txt");
  const matchIds = fs.readFileSync(filePath, "utf8");
  return matchIds
    .split("\n")
    .map(line => line.trim())
    .filter(line => line !== "")
    .map(Number);
}

// to run: tsx parse-matches.ts
// it will read all match ids from match-ids-to-parse.txt and parse them
async function main() {
  // Main execution
  const matchIds = getMatchIdsFromFile();
  for (const matchId of matchIds) {
    const matchData = await getMatch(matchId);
    await convertMatchDataToMatchTable(matchData?.data.match ?? {} as Match).catch(console.error);
    await convertMatchDataToMatchPlayersTable(matchData?.data.match ?? {} as Match).catch(console.error);
    await convertMatchDataToMatchDraftTable(matchData?.data.match ?? {} as Match).catch(console.error);
    // console.log(JSON.stringify(matchData, null, 2));
  }
}

main().catch(console.error);
