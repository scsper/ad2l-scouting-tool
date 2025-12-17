import { createClient } from "@supabase/supabase-js";

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
  has_divisions: boolean;
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

export default async function handler(
  _req: { query: Record<string, string> },
  res: {
    status: (code: number) => { json: (data: unknown) => void }
  },
) {
  try {
    const data = await getLeagues();
    res.status(200).json(data);
  } catch (error) {
    console.error("Error in handler:", error);
    res.status(500).json({ error: "Failed to fetch league data" });
  }
}

