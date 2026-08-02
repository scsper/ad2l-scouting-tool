import { useEffect, useState } from "react";
import { Show, SignInButton, UserButton } from "@clerk/react";
import { useGetLeaguesQuery } from "./league-api";
import { useLazyGetTeamsByLeagueQuery } from "./teams-api";
import type { LeagueTeamEntry } from "./teams-api";
import { UNASSIGNED_DIVISION, divisionsIn } from "../../../shared/divisions";

type LeagueAndTeamHeaderProps = {
  leagueId: number;
  teamId: number | undefined;
  division: string | undefined;
  /**
   * Both halves of a league change arrive in one call, because both have to
   * land in one navigation. Whether the team survives depends on the new
   * league's roster, so the answer comes back asynchronously — and reporting
   * it as two separate changes would either drop the team for a moment or push
   * a history entry for a URL nobody was meant to see.
   */
  onSelectLeague: (leagueId: number, keepTeamId: number | undefined) => void;
  onSelectTeam: (teamId: number) => void;
  onSelectDivision: (division: string | undefined) => void;
}

/**
 * Teams bucketed for the picker: each division in vocabulary order, then
 * anything with no division under "Unassigned".
 *
 * The team list is grouped rather than filtered by the selected division. You
 * routinely want your own team's tabs open while reading another division's
 * aggregate, and filtering would also hide a team you just added and forgot to
 * assign — which, with no other UI to fix it, is a team you can't get back to.
 */
function groupTeamsByDivision(teams: Record<number, LeagueTeamEntry>) {
  const entries = Object.entries(teams);
  const divisions = divisionsIn(entries.map(([, team]) => team.division));

  const groups: { label: string; teams: [string, LeagueTeamEntry][] }[] = divisions.map(
    division => ({
      label: division,
      teams: entries.filter(([, team]) => team.division === division),
    }),
  );

  // Anything the vocabulary doesn't recognise lands here too, not just NULLs —
  // a typo shouldn't invent a bracket, but the team still has to be reachable.
  const unassigned = entries.filter(
    ([, team]) => !divisions.some(division => division === team.division),
  );
  if (unassigned.length > 0) {
    groups.push({ label: UNASSIGNED_DIVISION, teams: unassigned });
  }

  return { divisions, groups };
}

export const LeagueAndTeamHeader = ({leagueId, teamId, division, onSelectLeague, onSelectTeam, onSelectDivision}: LeagueAndTeamHeaderProps) => {
  const leaguesResult = useGetLeaguesQuery();
  const { data: leagues, isLoading: isLoadingLeagues, isError: isErrorLeagues } = leaguesResult;
  const [triggerTeams, { data: teams, isLoading: isLoadingTeams, isError: isErrorTeams }] = useLazyGetTeamsByLeagueQuery();

  // The league being navigated to, held only until the URL catches up. The
  // dropdown has to show your pick the instant you make it, but the navigation
  // it triggers cannot happen until the new league's teams have been fetched.
  const [pendingLeagueId, setPendingLeagueId] = useState<number>();

  // Automatically load teams when leagueId is set (including on initial mount)
  useEffect(() => {
    if (leagueId) {
      void triggerTeams({ leagueId });
    }
  }, [leagueId, triggerTeams]);

  useEffect(() => {
    setPendingLeagueId(undefined);
  }, [leagueId]);

  if (isLoadingLeagues) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm border-b border-slate-700 shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
            <span className="text-slate-400">Loading leagues...</span>
          </div>
        </div>
      </div>
    );
  }
  if (isErrorLeagues) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm border-b border-red-500/30 shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="text-red-400">
            Please try again: {JSON.stringify(leaguesResult.error, null, 2)}
          </div>
        </div>
      </div>
    );
  }
  if (!leagues) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm border-b border-slate-700 shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="text-slate-400">No leagues found</div>
        </div>
      </div>
    );
  }

  const { divisions, groups } = groupTeamsByDivision(
    teams?.[leagueId] ?? {},
  );

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border-b border-slate-700 shadow-lg sticky top-0 z-10">
      <div className="container mx-auto px-4 py-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full">
          <h1 className="text-2xl font-bold bg-linear-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent shrink-0">
            AD2L Scouting Tool
          </h1>
          <div className="flex flex-col sm:flex-row gap-3 flex-1">
            <div className="flex-1">
              <select
                value={pendingLeagueId ?? leagueId}
                onChange={(e) => {
                  const selectedLeagueId = parseInt(e.target.value, 10);
                  setPendingLeagueId(selectedLeagueId);
                  // Keep the team if it also plays in the new league — comparing
                  // one team across seasons is the main reason to switch. Clear
                  // it otherwise: the selected pair is now a write target for the
                  // roster editor, so a team that isn't in this league would file
                  // players onto a roster that shouldn't exist.
                  //
                  // The answer has to be in hand before we navigate, so that the
                  // league and the team it keeps or drops move together.
                  void triggerTeams({ leagueId: selectedLeagueId })
                    .unwrap()
                    .then((teamsByLeague) => {
                      const teamsInLeague = teamsByLeague[selectedLeagueId] as
                        | Record<number, LeagueTeamEntry>
                        | undefined;
                      onSelectLeague(
                        selectedLeagueId,
                        teamId != null && teamsInLeague?.[teamId] ? teamId : undefined,
                      );
                    })
                    .catch(() => {
                      // The teams query already surfaces its own error state;
                      // put the dropdown back on the league we never left.
                      setPendingLeagueId(undefined);
                    });
                }}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:bg-slate-600"
              >
                <option value="">-- Select a league --</option>
                {leagues.map(league => <option key={league.id} value={league.id}>{league.name}</option>)}
              </select>
            </div>
            {isLoadingTeams && <div className="text-slate-400 py-2">Loading teams...</div>}
            {isErrorTeams && <div className="text-red-400 py-2">Error: Please try again</div>}
            {divisions.length > 0 && (
              <div className="flex-1">
                <select
                  value={division ?? ""}
                  onChange={(e) => {
                    onSelectDivision(e.target.value || undefined);
                  }}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:bg-slate-600"
                >
                  <option value="">-- Select a division --</option>
                  {divisions.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
              </div>
            )}
            {teams?.[leagueId] && (
              <div className="flex-1">
                <select
                  value={teamId ?? ""}
                  onChange={(e) => {
                    onSelectTeam(parseInt(e.target.value, 10));
                  }}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:bg-slate-600"
                >
                  <option value="">-- Select a team --</option>
                  {/* Flat until a league has divisions, so every pre-S48 season
                      and every single-bracket tournament looks exactly as before. */}
                  {divisions.length === 0
                    ? Object.entries(teams[leagueId]).map(([id, team]) =>
                        <option key={id} value={id}>{team.name}</option>
                      )
                    : groups.map(group =>
                        <optgroup key={group.label} label={group.label}>
                          {group.teams.map(([id, team]) =>
                            <option key={id} value={id}>{team.name}</option>
                          )}
                        </optgroup>
                      )}
                </select>
              </div>
            )}
          </div>
          <div className="shrink-0 sm:ml-auto">
            <Show when="signed-in">
              <UserButton />
            </Show>
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button className="px-3 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors">
                  Sign in
                </button>
              </SignInButton>
            </Show>
          </div>
        </div>
      </div>
    </div>
  )
}
