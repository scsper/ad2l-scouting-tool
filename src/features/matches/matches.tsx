import { useGetMatchesQuery } from "./matches-api";
import { useGetTeamsByLeagueQuery } from "../league-and-team-picker/teams-api";
import { getHero } from "../../utils/get-hero";

export const Matches = ({leagueId, teamId}: {leagueId: number; teamId: number}) => {
  const { data: matchesData, isLoading: isLoadingMatches, isError: isErrorMatches } = useGetMatchesQuery({ leagueId, teamId })
  const { data: teamsData, isLoading: isLoadingTeams, isError: isErrorTeams } = useGetTeamsByLeagueQuery({ leagueId })

  if (isLoadingMatches || isLoadingTeams) {
    return <div>Loading...</div>
  }
  if (isErrorMatches || isErrorTeams) {
    return <div>Error: Please try again</div>
  }

  return (
    <div>
      {matchesData && teamsData && (
          <div>
            {matchesData.matches.map((match) => {
              const scoutedTeam = match.players.filter(player => player.team_id === teamId);
              const otherTeam = match.players.filter(player => player.team_id !== teamId);

              const scoutedTeamId = scoutedTeam[0]?.team_id;
              const otherTeamId = otherTeam[0]?.team_id;

              const scoutedTeamName = scoutedTeamId ? teamsData[leagueId][scoutedTeamId] : "Unknown Team";
              const otherTeamName = otherTeamId ? teamsData[leagueId][otherTeamId] : "Unknown Team";

              const otherTeamBans = match.draft.filter(pickBan => pickBan.team_id !== teamId && !pickBan.is_pick);
              const matchDate = new Date(match.start_date_time * 1000).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

              const scoutedTeamWon = match.winning_team_id === scoutedTeamId;
              const otherTeamWon = match.winning_team_id === otherTeamId;

              return (
                <div key={match.id}>
                  {/* <h2 className="text-xl font-bold">{scoutedTeam.id} vs {otherTeam.id}</h2> */}
                  <div className="flex flex-row">
                    <div>
                      <p>{matchDate}</p>
                    </div>
                    <div className="flex flex-col pl-4">
                      <h3 className="text-lg font-bold">
                        {scoutedTeamName} {scoutedTeamWon && <span className="text-green-600">✓ Win</span>}{otherTeamWon && <span className="text-red-600">✗ Loss</span>}
                      </h3>
                      <ul>
                          {scoutedTeam.slice().sort((a,b) => {
                            const posA = a.position ?? "UNCATEGORIZED";
                            const posB = b.position ?? "UNCATEGORIZED";
                            return posA > posB ? 1 : -1;
                          }).map(player => <li key={player.player_id}>{getHero(player.hero_id)}</li>)}
                      </ul>
                    </div>

                    <div className="flex flex-col pl-4">
                      <h3 className="text-lg font-bold">
                        {otherTeamName} {otherTeamWon && <span className="text-green-600">✓ Win</span>}{scoutedTeamWon && <span className="text-red-600">✗ Loss</span>}
                      </h3>
                      <ul>
                        {otherTeam.slice().sort((a,b) => {
                            const posA = a.position ?? "UNCATEGORIZED";
                            const posB = b.position ?? "UNCATEGORIZED";
                            return posA > posB ? 1 : -1;
                          }).map(player => <li key={player.player_id}>{getHero(player.hero_id)}</li>)}
                      </ul>
                    </div>

                    <div className="flex flex-col pl-4">
                      <h3 className="text-lg font-bold">Bans Against</h3>
                      <ul>
                          {otherTeamBans.map(ban => <li key={ban.hero_id}>{getHero(ban.hero_id)}</li>)}
                      </ul>
                    </div>
                  </div>
                </div>
              )
            })}
      </div>
      )}
    </div>
  )
}
