import { useGetMatchesQuery } from "./matches-api";
import { getHero } from "../../utils/get-hero";

export const Matches = ({leagueId, teamId}: {leagueId: number; teamId: number}) => {
  const { data: matchesData, isLoading: isLoadingMatches, isError: isErrorMatches } = useGetMatchesQuery({ leagueId, teamId })
  return (
    <div>
      {isLoadingMatches && <div>Loading...</div>}
      {isErrorMatches && <div>Error: Please try again</div>}
      {matchesData && (
          <div>
            {matchesData.matches.map((match) => {
              const scoutedTeam = match.players.filter(player => player.team_id === teamId);
              const otherTeam = match.players.filter(player => player.team_id !== teamId);

              const otherTeamBans = match.draft.filter(pickBan => pickBan.team_id !== teamId && !pickBan.is_pick);

              return (
                <div key={match.match_id}>
                  {/* <h2 className="text-xl font-bold">{scoutedTeam.id} vs {otherTeam.id}</h2> */}
                  <div className="flex flex-row">
                    <div className="flex flex-col pl-4">
                      <h3 className="text-lg font-bold">{scoutedTeam[0].team_id}</h3>
                      <ul>
                        <li>
                          {scoutedTeam.slice().sort((a,b) => {
                            const posA = a.position ?? "UNCATEGORIZED";
                            const posB = b.position ?? "UNCATEGORIZED";
                            return posA > posB ? 1 : -1;
                          }).map(player => <li key={player.player_id}>{getHero(player.hero_id)}</li>)}
                        </li>
                      </ul>
                    </div>

                    <div className="flex flex-col pl-4">
                      <h3 className="text-lg font-bold">{otherTeam[0].team_id}</h3>
                      <ul>
                        <li>
                        {otherTeam.slice().sort((a,b) => {
                            const posA = a.position ?? "UNCATEGORIZED";
                            const posB = b.position ?? "UNCATEGORIZED";
                            return posA > posB ? 1 : -1;
                          }).map(player => <li key={player.player_id}>{getHero(player.hero_id)}</li>)}
                        </li>
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
