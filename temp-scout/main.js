import { getRecentMatches, getTopHeroes, getTopHeroesByPosition } from "./fetch-matches-for-player.js";
import { printReport } from "./print-report.js";

function parseArguments() {
  const args = process.argv.slice(2);
  const playerId = parseInt(args[0]);
  const positionIds = args[1];

  if (!playerId) {
    throw new Error('Player ID is required');
  }
  if (!positionIds) {
    throw new Error('Position IDs are required');
  }

  return { playerId, positionIds };
}

function showUsage() {
  console.log('Usage: node main.js [playerId] [positionIds]');
  console.log('');
  console.log('Arguments:');
  console.log('  playerId     Steam account ID');
  console.log('  positionIds  Comma-separated position IDs');
  console.log('');
  console.log('Examples:');
  console.log('  node main.js                    # Use defaults');
  console.log('  node main.js 12345678          # Custom player ID');
  console.log('  node main.js 12345678 POSITION_1,POSITION_2  # Custom player and positions');
  console.log('');
}

function parsePositions(positions) {
  switch (positions) {
    case "CARRY":
      return ["POSITION_1"];
    case "MID":
      return ["POSITION_2"];
    case "OFFLANE":
      return ["POSITION_3"];
    case "SUPPORT":
      return ["POSITION_4", "POSITION_5"];
    default:
      throw new Error(`Invalid position: ${positions}`);
  }
}
async function main() {
  // Check for help flag
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    showUsage();
    return;
  }

  const { playerId, positionIds } = parseArguments();

  console.log(`Fetching matches for player ${playerId} with positions: ${positionIds}`);
  console.log('');

  try {
    const recentHeroMatches = await getRecentMatches(playerId, parsePositions(positionIds));
    console.log(recentHeroMatches);
    const recentHeroesGroupBy = recentHeroMatches.data.player.heroesGroupBy;

    console.log('Recent heroes:');
    printReport(recentHeroesGroupBy);
    console.log('');

    const topHeroesByPosition = await getTopHeroesByPosition(playerId, parsePositions(positionIds));
    const topHeroesByPositionGroupBy = topHeroesByPosition.data.player.heroesGroupBy;
    const top10HeroesByPosition = topHeroesByPositionGroupBy.sort((a, b) => b.matchCount - a.matchCount).slice(0, 10);

    console.log('Top heroes by position:');
    printReport(top10HeroesByPosition);
    console.log('');

    const topHeroes = await getTopHeroes(playerId);
    const topHeroesGroupBy = topHeroes.data.player.heroesGroupBy;
    const top10Heroes = topHeroesGroupBy.sort((a, b) => b.matchCount - a.matchCount).slice(0, 10);

    console.log('Top 10 heroes:');
    printReport(top10Heroes);
    console.log('');

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
