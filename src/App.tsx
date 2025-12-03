import "./App.css"
import { Counter } from "./features/counter/Counter"
import { Quotes } from "./features/quotes/Quotes"
import logo from "./logo.svg"

export const App = () => (
  <div className="App">
    <input type="text" placeholder="Enter the league id" />
    <input type="text" placeholder="Enter the team id" />
    <button className="bg-blue-500 text-white p-2 rounded-md">Search</button>
  </div>
)
