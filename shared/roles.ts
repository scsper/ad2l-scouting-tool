/**
 * The `roster_member.role` values (the dropdown in `CreatePlayerModal`) mapped
 * to Stratz position ids. Shared because three callers need it: the pub-stats
 * fetch on both the client and the API, and the Players tab's position sort.
 */
const ROLE_POSITIONS: Record<string, string> = {
  Carry: "POSITION_1",
  Mid: "POSITION_2",
  Offlane: "POSITION_3",
  "Soft Support": "POSITION_4",
  "Hard Support": "POSITION_5",
}

/** The one position a declared role means, or null if the role isn't recognized. */
export function roleToPosition(role: string): string | null {
  return ROLE_POSITIONS[role] ?? null
}

/**
 * Positions to request pub stats for. Both supports widen to 4 and 5: pubs don't
 * respect the soft/hard split the roster records, so filtering to one would drop
 * most of a support's games.
 */
export function roleToPositions(role: string): string[] {
  if (role === "Soft Support" || role === "Hard Support") {
    return ["POSITION_4", "POSITION_5"]
  }
  const position = roleToPosition(role)
  return position ? [position] : []
}
