/** Shared explanation for the team and league player stats. */
export function dewardTooltip(type: "obs" | "sen", perGame = true): string {
  const ward = type === "obs" ? "observer" : "sentry"
  return `Enemy ${ward} wards destroyed${perGame ? " per game" : " in this game"}. Credit goes to the player who provided True Sight (usually the sentry placer), even if a teammate got the last hit. The ward type refers to the enemy ward destroyed.`
}
