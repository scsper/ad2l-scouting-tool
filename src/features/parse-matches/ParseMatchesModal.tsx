import { useState } from "react";
import { useAuth } from "@clerk/react";
import { Modal } from "../../components/Modal";
import { useAppDispatch } from "../../app/hooks";
import { matchesApiSlice, useParseMatchMutation } from "../matches/matches-api";
import { leagueStatsApiSlice } from "../league-stats/league-stats-api";
import { parseMatchIds } from "./parse-match-ids";

type ParseMatchesModalProps = {
  isOpen: boolean;
  onClose: () => void;
}

type RowState =
  | { status: "pending" }
  | { status: "running" }
  | { status: "ok"; label: string; warnings: string[] }
  | { status: "error"; message: string };

type Row = {
  matchId: number;
  state: RowState;
}

/** Pull the human-readable reason out of a FetchBaseQueryError. */
function errorMessage(error: unknown): string {
  // RTK Query rejects with a plain object, so a real Error came from our own
  // pre-flight checks and already carries the message we want to show.
  if (error instanceof Error) return error.message;
  if (typeof error !== "object" || error === null) return "Unexpected error";

  const data = (error as { data?: unknown }).data;
  if (typeof data === "object" && data !== null && "error" in data) {
    const message = (data as { error: unknown }).error;
    if (typeof message === "string") return message;
  }

  const status = (error as { status?: unknown }).status;
  if (status === "FETCH_ERROR") return "Network error";
  if (typeof status === "number") return `Request failed (${String(status)})`;
  if (typeof status === "string") return `Request failed (${status})`;
  return "Request failed";
}

export const ParseMatchesModal = ({ isOpen, onClose }: ParseMatchesModalProps) => {
  const [input, setInput] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [invalidTokens, setInvalidTokens] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const { getToken } = useAuth();
  const dispatch = useAppDispatch();
  const [parseMatch] = useParseMatchMutation();

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (isRunning) return;

    const { ids, invalid } = parseMatchIds(input);
    setInvalidTokens(invalid);
    if (ids.length === 0) {
      setRows([]);
      return;
    }

    if (!(await getToken())) {
      setRows(
        ids.map(matchId => ({
          matchId,
          state: { status: "error", message: "Not signed in" },
        })),
      );
      return;
    }

    setIsRunning(true);
    setRows(ids.map(matchId => ({ matchId, state: { status: "pending" } })));

    let anySucceeded = false;

    // Sequential on purpose: one request per match keeps each well inside the
    // serverless timeout, and OpenDota's free tier allows 60 requests a minute.
    for (const [index, matchId] of ids.entries()) {
      setRows(current =>
        current.map((row, i) =>
          i === index ? { ...row, state: { status: "running" } } : row,
        ),
      );

      try {
        // The token used to be re-read here every iteration, because Clerk
        // sessions live about a minute and a season backfill runs longer than
        // that, so a hoisted one 401s partway through. `authedBaseQuery` now
        // fetches it per request, which gets the same result for every call in
        // the app rather than only this loop.
        const result = await parseMatch({ matchId, overwrite }).unwrap();
        anySucceeded = true;
        setRows(current =>
          current.map((row, i) =>
            i === index
              ? {
                  ...row,
                  state: {
                    status: "ok",
                    label: result.status,
                    warnings: result.warnings,
                  },
                }
              : row,
          ),
        );
      } catch (error) {
        setRows(current =>
          current.map((row, i) =>
            i === index
              ? { ...row, state: { status: "error", message: errorMessage(error) } }
              : row,
          ),
        );
      }
    }

    setIsRunning(false);

    // Invalidate once for the whole batch rather than per match, so a season
    // backfill does not trigger one refetch of every match query per ID.
    if (anySucceeded) {
      dispatch(matchesApiSlice.util.invalidateTags(["Matches"]));
      dispatch(leagueStatsApiSlice.util.invalidateTags(["LeagueStats"]));
    }
  };

  const handleClose = () => {
    if (isRunning) return;
    setInput("");
    setRows([]);
    setInvalidTokens([]);
    onClose();
  };

  const succeeded = rows.filter(row => row.state.status === "ok").length;
  const failed = rows.filter(row => row.state.status === "error").length;
  const done = rows.length > 0 && !isRunning;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Parse matches"
      widthClassName="max-w-2xl"
    >
      <form onSubmit={e => { void handleSubmit(e); }} className="flex flex-col gap-4">
        <div>
          <label htmlFor="match-ids" className="block text-sm font-medium text-slate-300 mb-1">
            Match IDs
          </label>
          <textarea
            id="match-ids"
            value={input}
            onChange={e => { setInput(e.target.value); }}
            disabled={isRunning}
            rows={6}
            placeholder={"8811336092\n8811291254\n8811336867"}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
          />
          <p className="text-xs text-slate-500 mt-1">
            One per line, or separated by commas or spaces. The league and teams come from OpenDota.
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={overwrite}
            onChange={e => { setOverwrite(e.target.checked); }}
            disabled={isRunning}
            className="rounded border-slate-600 bg-slate-700"
          />
          Re-parse matches that are already in the database (overwrites their players and draft)
        </label>

        {invalidTokens.length > 0 && (
          <div className="text-sm text-amber-400">
            Ignored {invalidTokens.length} entr{invalidTokens.length === 1 ? "y" : "ies"} that
            {invalidTokens.length === 1 ? " is not a" : " are not"} valid match ID
            {invalidTokens.length === 1 ? "" : "s"}: {invalidTokens.slice(0, 5).join(", ")}
            {invalidTokens.length > 5 ? "…" : ""}
          </div>
        )}

        <button
          type="submit"
          disabled={isRunning || input.trim() === ""}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium transition-colors"
        >
          {isRunning ? `Parsing ${String(succeeded + failed + 1)} of ${String(rows.length)}…` : "Parse"}
        </button>

        {rows.length > 0 && (
          <div className="flex flex-col gap-1 max-h-[40vh] overflow-y-auto border-t border-slate-700 pt-3">
            {rows.map(row => (
              <div key={row.matchId} className="text-sm">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-slate-400 shrink-0">{row.matchId}</span>
                  {row.state.status === "pending" && <span className="text-slate-600">queued</span>}
                  {row.state.status === "running" && <span className="text-blue-400">parsing…</span>}
                  {row.state.status === "ok" && <span className="text-green-400">{row.state.label}</span>}
                  {row.state.status === "error" && (
                    <span className="text-red-400">{row.state.message}</span>
                  )}
                </div>
                {row.state.status === "ok" &&
                  row.state.warnings.map(warning => (
                    <div key={warning} className="text-xs text-amber-400 pl-[9.5rem]">
                      {warning}
                    </div>
                  ))}
              </div>
            ))}
          </div>
        )}

        {done && (
          <div className="text-sm text-slate-400 border-t border-slate-700 pt-3">
            {succeeded} succeeded, {failed} failed.
          </div>
        )}
      </form>
    </Modal>
  );
};
