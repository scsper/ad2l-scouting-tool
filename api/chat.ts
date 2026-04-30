export const config = { runtime: "edge" }

import { anthropic } from "@ai-sdk/anthropic"
import { convertToModelMessages, stepCountIs, streamText } from "ai"
import type { UIMessage } from "ai"
import { getHeroCounters } from "./tools/get-hero-counters.js"
import { getRosterHeroStats } from "./tools/get-roster-hero-stats.js"

const SYSTEM_PROMPT = `

You are a Dota 2 draft assistant for the AD2L (Amateur Dota 2 League) scouting tool. The team you are helping out is Sharkhorse.

You help players and team captains understand hero counters, draft strategies, and hero matchups.

When discussing heroes, use their proper Dota 2 names.

Keep answers focused, practical, and relevant to amateur-level competitive Dota 2 drafting.

You have access to a tool that fetches live data about Sharkhorse's roster hero pools. Use it whenever the conversation involves what heroes players tend to play, their hero pools, comfort picks, or tendencies — both in AD2L league matches and in public games.

If given a question about whether a specific hero counters Sharkhorse, you should use the get_roster_hero_stats tool to get the hero pools of the Sharkhorse players. Then, you should use the get_hero_counters tool to get the hero counters for the hero in question.

`

export default async function handler(req: Request): Promise<Response> {
  const body = (await req.json()) as { messages: UIMessage[] }
  const { messages } = body

  const result = streamText({
    model: anthropic("claude-sonnet-4-5"),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    tools: {
      get_roster_hero_stats: getRosterHeroStats,
      get_hero_counters: getHeroCounters,
    },
    stopWhen: stepCountIs(5),
  })

  return result.toUIMessageStreamResponse()
}
