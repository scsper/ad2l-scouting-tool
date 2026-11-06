import type { SupabaseClient } from "@supabase/supabase-js"
import type { ReplayDewards } from "./replay-dewards.js"

/** Updates only reveal credit; safe to repeat after an interrupted backfill. */
export async function storeDewards(
  supabase: SupabaseClient,
  matchId: number,
  players: ReplayDewards[],
): Promise<void> {
  for (const player of players) {
    const { data, error } = await supabase
      .from("match_player")
      .update({
        obs_dewards: player.obsDewards,
        sen_dewards: player.senDewards,
      })
      .eq("match_id", matchId)
      .eq("hero_id", player.heroId)
      .select("hero_id")
    if (error) throw new Error(error.message)
    if (data.length !== 1) {
      throw new Error(
        `Expected one player for match ${String(matchId)}, hero ${String(player.heroId)}; updated ${String(data.length)}`,
      )
    }
  }
}
