import { useState } from "react";
import { LeagueAndTeamHeader } from "./features/league-and-team-picker/league-and-team-header"
import { Matches } from "./features/matches/matches";
import { AggregateBansAgainst } from "./features/matches/aggregate-bans-against";
import { AggregateHeroesPlayedByPosition } from "./features/matches/aggregate-heroes-played-by-position";
import { AggregateContestRate } from "./features/matches/aggregate-contest-rate";

type Tab = "team" | "players" | "lanes";

export const App = () => {
  const [teamId, setTeamId] = useState<number>();
  const [leagueId, setLeagueId] = useState<number>(19137); // AD2L Season 46
  const [activeTab, setActiveTab] = useState<Tab>("team");

  const tabs: { id: Tab; label: string }[] = [
    { id: "team", label: "Team" },
    { id: "players", label: "Players" },
    { id: "lanes", label: "Lanes" },
  ];

  return (
    <div className="App min-h-screen">
      <LeagueAndTeamHeader
        leagueId={leagueId}
        setLeagueId={setLeagueId}
        teamId={teamId}
        setTeamId={setTeamId}
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

      <div className="container mx-auto px-4 py-6">
        {activeTab === "team" && (
          <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr_1fr_1fr] gap-6">
            {leagueId && teamId && <Matches leagueId={leagueId} teamId={teamId} />}
            {leagueId && teamId && <AggregateBansAgainst leagueId={leagueId} teamId={teamId} />}
            {leagueId && teamId && <AggregateHeroesPlayedByPosition leagueId={leagueId} teamId={teamId} />}
            {leagueId && teamId && <AggregateContestRate leagueId={leagueId} teamId={teamId} />}
          </div>
        )}
        
        {activeTab === "players" && (
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg p-12 text-center">
            <div className="text-slate-400 text-lg font-medium">Coming Soon</div>
            <div className="text-slate-500 text-sm mt-2">Player statistics and analysis will be available here</div>
          </div>
        )}
        
        {activeTab === "lanes" && (
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg p-12 text-center">
            <div className="text-slate-400 text-lg font-medium">Coming Soon</div>
            <div className="text-slate-500 text-sm mt-2">Lane matchup analysis will be available here</div>
          </div>
        )}
      </div>
    </div>
  )
}
