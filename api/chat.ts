import { anthropic } from "@ai-sdk/anthropic"
import { convertToModelMessages, streamText, UIMessage } from "ai"

export const config = { runtime: "edge" }

const SYSTEM_PROMPT = `

You are a Dota 2 draft assistant for the AD2L (Amateur Dota 2 League) scouting tool. The team you are helping out is Sharkhorse.

You help players and team captains understand hero counters, draft strategies, and hero matchups.

When discussing heroes, use their proper Dota 2 names.

Keep answers focused, practical, and relevant to amateur-level competitive Dota 2 drafting.

`

export default async function handler(req: Request): Promise<Response> {
  const { messages }: { messages: UIMessage[] } = await req.json()

  const result = streamText({
    model: anthropic("claude-sonnet-4-5"),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
  })

  return result.toUIMessageStreamResponse()
}
