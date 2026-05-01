export const config = { runtime: "edge" }

import { anthropic } from "@ai-sdk/anthropic"
import { convertToModelMessages, stepCountIs, streamText } from "ai"
import type { UIMessage } from "ai"
import { getHeroCounters } from "./tools/get-hero-counters.js"
import { getRosterHeroStats } from "./tools/get-roster-hero-stats.js"

function buildSystemPrompt(leagueId?: number, teamId?: number, teamName?: string): string {
  const contextLines: string[] = []
  if (leagueId !== undefined) contextLines.push(`The current league ID is ${String(leagueId)}.`)
  if (teamId !== undefined) contextLines.push(`The current team ID being scouted is ${String(teamId)}.`)
  if (teamName !== undefined) contextLines.push(`The current team being scouted is "${teamName}".`)
  const contextBlock = contextLines.length > 0 ? `\n${contextLines.join("\n")}\n` : ""

  const teamRef = teamName ?? (teamId !== undefined ? `team ID ${String(teamId)}` : "the selected team")

  return `
You are a Dota 2 draft assistant for the AD2L (Amateur Dota 2 League) scouting tool. The team you are helping out is Sharkhorse. Sharkhorse's team ID is 9403219.

${contextBlock}

You help the sharkhorse team captain understand hero counters, draft strategies, and hero matchups.

When discussing heroes, use their proper Dota 2 names.

Keep answers focused, practical, and relevant to amateur-level competitive Dota 2 drafting.

You have access to a tool that fetches live data about Sharkhorse and ${teamRef}'s roster hero pools. Use it whenever the conversation involves what heroes players tend to play, their hero pools, comfort picks, or tendencies — both in AD2L league matches and in public games. When calling get_roster_hero_stats, always pass the current team ID (${teamId !== undefined ? String(teamId) : "from context"}) and the current league ID (${leagueId !== undefined ? String(leagueId) : "omit to aggregate all leagues"}) so the stats are scoped correctly.

When giving analysis on team's draft strategies, prioritize the heroes that are picked by a team in league play, not pub play.

If given a question about whether a specific hero counters ${teamRef}, you should use the get_roster_hero_stats tool to get the hero pools of the team's players. Then, you should use the get_hero_counters tool to get the hero counters for the hero in question.
`
}

export default async function handler(req: Request): Promise<Response> {
  const body = (await req.json()) as { messages: UIMessage[]; leagueId?: number; teamId?: number; teamName?: string }
  const { messages, leagueId, teamId, teamName } = body

  const result = streamText({
    model: anthropic("claude-sonnet-4-5"),
    system: buildSystemPrompt(leagueId, teamId, teamName),
    messages: await convertToModelMessages(messages),
    tools: {
      get_roster_hero_stats: getRosterHeroStats,
      get_hero_counters: getHeroCounters,
    },
    stopWhen: stepCountIs(5),
  })

  return result.toUIMessageStreamResponse()
}
