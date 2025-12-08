import { useLazyGetMatchesQuery } from "./features/matches/matches-api"

export const App = () => {
  const [trigger] = useLazyGetMatchesQuery()

  return (
    <div className="App">
      <input type="text" placeholder="Enter the league id" />
      <input type="text" placeholder="Enter the team id" />
      <button className="bg-blue-500 text-white p-2 rounded-md" onClick={() => void trigger({ leagueId: "18126", teamId: "1938666" })}>Search</button>
    </div>
  )
}
