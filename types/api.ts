import type { MatchPlayerRow, MatchDraftRow, MatchRow } from "./db.js";

export type MatchApiResponse = MatchRow & {
  players: MatchPlayerRow[];
  draft: MatchDraftRow[];
}
