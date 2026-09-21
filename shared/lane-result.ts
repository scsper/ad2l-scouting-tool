export type LaneResult = "win_stomp" | "win" | "draw" | "loss" | "loss_stomp"

/** Lane result from the combined gold and XP advantage at ten minutes. */
export function getLaneResult(goldAdv: number, xpAdv: number): LaneResult {
  const score = goldAdv + xpAdv
  if (score >= 2500) return "win_stomp"
  if (score > 1000) return "win"
  if (score >= -1000) return "draw"
  if (score > -2500) return "loss"
  return "loss_stomp"
}
