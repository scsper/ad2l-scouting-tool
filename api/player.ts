import { createClient } from "@supabase/supabase-js";
import type { PlayerRow } from "../types/db";

const SUPABASE_DOTA2_URL = process.env.SUPABASE_DOTA2_URL ?? "";
const SUPABASE_DOTA2_SECRET_KEY = process.env.SUPABASE_DOTA2_SECRET_KEY ?? "";

const supabase = createClient(SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

type CreatePlayerRequest = {
  id: number;
  name: string;
  rank: string;
  role: string;
  team_id: number;
}

async function createPlayer(playerData: CreatePlayerRequest): Promise<PlayerRow> {
  const result = await supabase
    .from('player')
    .insert({
      id: playerData.id,
      name: playerData.name,
      rank: playerData.rank,
      role: playerData.role,
      team_id: playerData.team_id
    })
    .select()
    .single();

  if (result.error) {
    console.error("Error creating player:", result.error);
    throw result.error;
  }

  return result.data as PlayerRow;
}

async function getPlayersByTeamId(teamId: string): Promise<PlayerRow[]> {
  const teamIdNum = parseInt(teamId, 10);

  const result = await supabase
    .from('player')
    .select('*')
    .eq('team_id', teamIdNum)
    .order('name', { ascending: true });

  if (result.error) {
    console.error("Error fetching players for team:", result.error);
    throw result.error;
  }

  return result.data as PlayerRow[];
}

async function deletePlayer(playerId: string): Promise<void> {
  const playerIdNum = parseInt(playerId, 10);

  const result = await supabase
    .from('player')
    .delete()
    .eq('id', playerIdNum);

  if (result.error) {
    console.error("Error deleting player:", result.error);
    throw result.error;
  }
}

export default async function handler(
  req: { method: string; body: CreatePlayerRequest; query: { teamId: string; playerId: string } },
  res: {
    status: (code: number) => { json: (data: unknown) => void }
  },
) {
  if (req.method === 'GET') {
    const { teamId } = req.query;

    if (!teamId) {
      res.status(400).json({ error: "teamId is required" });
      return;
    }

    try {
      const data = await getPlayersByTeamId(teamId);
      res.status(200).json(data);
    } catch (error) {
      console.error("Error in handler:", error);
      res.status(500).json({ error: "Failed to fetch players" });
    }
    return;
  }

  if (req.method === 'POST') {
    const { id, name, rank, role, team_id } = req.body;

    if (!id || !name || !rank || !role || !team_id) {
      res.status(400).json({ error: "id, name, rank, role, and team_id are required" });
      return;
    }

    try {
      const data = await createPlayer({ id, name, rank, role, team_id });
      res.status(201).json(data);
    } catch (error) {
      console.error("Error in handler:", error);
      res.status(500).json({ error: "Failed to create player" });
    }
    return;
  }

  if (req.method === 'DELETE') {
    const { playerId } = req.query;

    if (!playerId) {
      res.status(400).json({ error: "playerId is required" });
      return;
    }

    try {
      await deletePlayer(playerId);
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("Error in handler:", error);
      res.status(500).json({ error: "Failed to delete player" });
    }
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
