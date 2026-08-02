import { useState } from "react";
import { Show, SignInButton } from "@clerk/react";
import { LeagueAndTeamHeader } from "./features/league-and-team-picker/league-and-team-header"
import { Matches } from "./features/matches/matches";
import { AggregateBansAgainst } from "./features/matches/aggregate-bans-against";
import { AggregateBansFor } from "./features/matches/aggregate-bans-for";
import { AggregateHeroesPlayedByPosition } from "./features/matches/aggregate-heroes-played-by-position";
import { AggregateContestRate } from "./features/matches/aggregate-contest-rate";
import { Players } from "./features/players/players";
import { PlayerStats } from "./features/player-stats/PlayerStats";
import { Lanes } from "./features/lanes/Lanes";
import { Wards } from "./features/wards/Wards";
import { LeagueAggregate } from "./features/league-aggregate/LeagueAggregate";
import { ParseMatchesModal } from "./features/parse-matches/ParseMatchesModal";
import { AddTeamModal } from "./features/league-and-team-picker/AddTeamModal";
import { useLeagueDivisions } from "./features/league-and-team-picker/teams-api";

type Tab = "team" | "players" | "pub-stats" | "lanes" | "wards";

export const App = () => {
  const [teamId, setTeamId] = useState<number>();
  const [leagueId, setLeagueId] = useState<number>(19554); // AD2L Season 47
  const [division, setDivision] = useState<string>();
  const [activeTab, setActiveTab] = useState<Tab>("team");
  const [showLeagueAggregate, setShowLeagueAggregate] = useState(false);
  const [isParseModalOpen, setIsParseModalOpen] = useState(false);
  const [isAddTeamModalOpen, setIsAddTeamModalOpen] = useState(false);

  // Divisions scope the aggregate view and nothing else. A team's own tabs stay
  // whole-league on purpose: when you scout a team you want every game they
  // played, and no read path below is division-filtered.
  const divisions = useLeagueDivisions(leagueId);
  const aggregateLabel = divisions.length > 0 ? "Division" : "League";

  const tabs: { id: Tab; label: string }[] = [
    { id: "team", label: "Team" },
    { id: "players", label: "Players" },
    { id: "pub-stats", label: "Pub Stats" },
    { id: "lanes", label: "Lanes" },
    { id: "wards", label: "Wards" },
  ];

  return (
    <div className="App flex flex-col h-screen overflow-hidden">
      <Show when="signed-out">
        <div className="flex flex-col items-center justify-center h-[calc(100vh-48px)] gap-3">
          <p className="text-slate-300 text-lg font-medium">Please sign in to continue</p>
          <SignInButton>
            <button className="px-5 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors">
              Sign in
            </button>
          </SignInButton>
        </div>
      </Show>

      <Show when="signed-in">
      <LeagueAndTeamHeader
        leagueId={leagueId}
        setLeagueId={setLeagueId}
        teamId={teamId}
        setTeamId={setTeamId}
        division={division}
        setDivision={setDivision}
      />

      {leagueId && teamId && (
        <div className="bg-slate-800/30 border-b border-slate-700">
          <div className="container mx-auto px-4">
            <div className="flex gap-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                  }}
                  className={`px-6 py-3 font-medium transition-all relative ${
                    activeTab === tab.id
                      ? "text-blue-400 bg-slate-800/50"
                      : "text-slate-400 hover:text-slate-300 hover:bg-slate-800/30"
                  }`}
                >
                  {tab.label}
                  {activeTab === tab.id && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400"></div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {leagueId && !teamId && (
        <div className="container mx-auto px-4 py-6">
          {showLeagueAggregate ? (
            <>
              <div className="flex items-center gap-4 mb-6">
                <button
                  onClick={() => { setShowLeagueAggregate(false); }}
                  className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
                >
                  ← Back
                </button>
                <h2 className="text-lg font-semibold text-slate-200">
                  {aggregateLabel} Aggregate Data
                </h2>
              </div>
              <LeagueAggregate
                leagueId={leagueId}
                division={division}
                hasDivisions={divisions.length > 0}
              />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <span className="text-slate-400 text-lg">Select a team to continue</span>
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowLeagueAggregate(true); }}
                  className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium transition-colors border border-slate-600"
                >
                  Generate aggregate {aggregateLabel.toLowerCase()} data
                </button>
                <button
                  onClick={() => { setIsParseModalOpen(true); }}
                  className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium transition-colors border border-slate-600"
                >
                  Parse matches
                </button>
                <button
                  onClick={() => { setIsAddTeamModalOpen(true); }}
                  className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium transition-colors border border-slate-600"
                >
                  Add team
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto overflow-x-auto">
        <div className="container mx-auto px-4 py-6">
          {activeTab === "team" && (
            <div className="grid grid-cols-1 xl:grid-cols-[2.25fr_1fr_1fr_1fr] gap-6">
              {leagueId && teamId && <Matches leagueId={leagueId} teamId={teamId} />}
              {leagueId && teamId && (
                <div className="flex flex-col gap-6">
                  <AggregateBansAgainst leagueId={leagueId} teamId={teamId} />
                  <AggregateBansFor leagueId={leagueId} teamId={teamId} />
                </div>
              )}
              {leagueId && teamId && <AggregateHeroesPlayedByPosition leagueId={leagueId} teamId={teamId} />}
              {leagueId && teamId && <AggregateContestRate leagueId={leagueId} teamId={teamId} />}
            </div>
          )}

          {activeTab === "players" && leagueId && teamId && (
            <PlayerStats leagueId={leagueId} teamId={teamId} />
          )}

          {activeTab === "pub-stats" && leagueId && teamId && (
            <Players leagueId={leagueId} teamId={teamId} />
          )}

          {activeTab === "lanes" && leagueId && teamId && (
            <Lanes leagueId={leagueId} teamId={teamId} />
          )}

          {activeTab === "wards" && leagueId && teamId && (
            <Wards leagueId={leagueId} teamId={teamId} />
          )}
        </div>
      </div>

      <ParseMatchesModal
        isOpen={isParseModalOpen}
        onClose={() => { setIsParseModalOpen(false); }}
      />

      <AddTeamModal
        isOpen={isAddTeamModalOpen}
        onClose={() => { setIsAddTeamModalOpen(false); }}
        leagueId={leagueId}
      />
      </Show>
    </div>
  )
}
