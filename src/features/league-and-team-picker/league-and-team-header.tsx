import { useEffect, useState } from "react";
import { Show, SignInButton, UserButton } from "@clerk/react";
import { Modal } from "../../components/Modal";
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
    // Only an admin can ever see this group: `api/team` filters unassigned
    // teams out for everyone else, because NULL is not a division anyone was
    // granted. That makes a team you forgot to assign invisible to exactly the
    // people who need it, while looking fine from here — so the label reads as
    // a to-do rather than a category, since this is the only place the problem
    // is visible at all.
    groups.push({
      label: `${UNASSIGNED_DIVISION} — not visible to scoped users`,
      teams: unassigned,
    });
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

  /** The phone picker sheet. At `md` and up the same controls are always on screen. */
  const [isPickerOpen, setIsPickerOpen] = useState(false);

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

  const selectClassName =
    "w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:bg-slate-600";

  const changeLeague = (selectedLeagueId: number) => {
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
  };

  /**
   * The same three controls in both places. Rendered inline at `md` and up and
   * inside the sheet below it — one definition rather than two, because these
   * carry the league-change logic above and a second copy is a second thing to
   * forget when it changes.
   *
   * They stay native `<select>`s on purpose: Android Chrome renders one as a
   * full-screen dialog that already handles `<optgroup>`, long lists and the
   * back button, and no custom listbox we wrote would do those three as well.
   */
  const pickers = (
    <>
      <div className="flex-1">
        <select
          aria-label="League"
          value={pendingLeagueId ?? leagueId}
          onChange={(e) => { changeLeague(parseInt(e.target.value, 10)); }}
          className={selectClassName}
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
            aria-label="Division"
            value={division ?? ""}
            onChange={(e) => {
              onSelectDivision(e.target.value || undefined);
              setIsPickerOpen(false);
            }}
            className={selectClassName}
          >
            <option value="">-- Select a division --</option>
            {divisions.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
      )}
      {teams?.[leagueId] && (
        <div className="flex-1">
          <select
            aria-label="Team"
            value={teamId ?? ""}
            onChange={(e) => {
              onSelectTeam(parseInt(e.target.value, 10));
              setIsPickerOpen(false);
            }}
            className={selectClassName}
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
    </>
  );

  const account = (
    <>
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
    </>
  );

  const teamName = teamId == null ? undefined : teams?.[leagueId]?.[teamId]?.name;
  const context = [leagues.find(l => l.id === leagueId)?.name, division]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border-b border-slate-700 shadow-lg">
      <div className="container mx-auto px-3 sm:px-4 py-2 md:py-4">
        {/*
          The phone header is one line, because it hides and returns with the
          tab strip on every scroll — three stacked dropdowns re-entering the
          screen would cover a third of it. What is left is the question the bar
          actually answers while you read: which team, in which league. Changing
          any of it is a tap away rather than permanently on screen.

          Team first and league second, rather than the reading order of the
          URL: the two truncate against each other, and the team is the one you
          look at to check you are on the right screen.
        */}
        <div className="flex items-center gap-2 md:hidden">
          <button
            onClick={() => { setIsPickerOpen(true); }}
            aria-haspopup="dialog"
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-slate-700/40 active:bg-slate-700/60 transition-colors"
          >
            <span className="truncate font-semibold text-slate-100 shrink-0 max-w-[55%]">
              {teamName ?? "Pick a team"}
            </span>
            <span className="truncate text-xs text-slate-400">{context}</span>
            <svg className="w-4 h-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <div className="shrink-0">{account}</div>
        </div>

        {/* `md` and up is exactly what it was: title, three inline selects, account. */}
        <div className="hidden md:flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full">
          <h1 className="text-2xl font-bold bg-linear-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent shrink-0">
            AD2L Scouting Tool
          </h1>
          <div className="flex flex-col sm:flex-row gap-3 flex-1">{pickers}</div>
          <div className="shrink-0 sm:ml-auto">{account}</div>
        </div>
      </div>

      <Modal
        isOpen={isPickerOpen}
        onClose={() => { setIsPickerOpen(false); }}
        title={"League & team"}
      >
        <div className="flex flex-col gap-3">{pickers}</div>
      </Modal>
    </div>
  )
}
