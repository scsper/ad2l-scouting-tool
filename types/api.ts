import type { MatchPlayerRow, MatchDraftRow, MatchRow } from "./db";

export type MatchApiResponse = MatchRow & {
  players: MatchPlayerRow[];
  draft: MatchDraftRow[];
}
