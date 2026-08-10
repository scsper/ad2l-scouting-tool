import { createClient } from "@supabase/supabase-js";
import { requireScope, respondToAccessError } from "../server/access.js";
import { canReadLeague } from "../server/access-scope.js";

const SUPABASE_DOTA2_URL = process.env.SUPABASE_DOTA2_URL ?? "";
const SUPABASE_DOTA2_SECRET_KEY = process.env.SUPABASE_DOTA2_SECRET_KEY ?? "";

const supabase = createClient(SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

export type League = {
  id: number;
  created_at: string;
  updated_at: string;
  name: string;
}

async function getLeagues(): Promise<League[]> {
  const result = await supabase
    .from('league')
    .select('*');

  if (result.error) {
    console.error("Error fetching league:", result.error);
    throw result.error;
  }

  return result.data as League[];
}

/**
 * The league dropdown, filtered rather than refused.
 *
 * This route takes no parameters, so there is no wrong question to reject — it
 * asks "what may I see?", and the honest answer to that is a shorter list. A
 * scoped user gets only the leagues they hold a grant in, which for the case
 * this was built for is a single season.
 */
export default async function handler(
  req: { query: Record<string, string>; headers: Record<string, string | string[] | undefined> },
  res: {
    status: (code: number) => { json: (data: unknown) => void }
  },
) {
  try {
    const scope = await requireScope(req.headers.authorization);
    const data = await getLeagues();
    res.status(200).json(data.filter(league => canReadLeague(scope, league.id)));
  } catch (error) {
    if (respondToAccessError(error, res)) return;
    console.error("Error in handler:", error);
    res.status(500).json({ error: "Failed to fetch league data" });
  }
}

