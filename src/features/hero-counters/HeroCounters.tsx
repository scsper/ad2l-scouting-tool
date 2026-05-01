import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { useEffect, useMemo, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

interface HeroCountersProps {
  leagueId: number
  teamId: number
  teamName?: string
}

export const HeroCounters = ({ leagueId, teamId, teamName }: HeroCountersProps) => {
  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/chat", body: { leagueId, teamId, teamName } }),
    [leagueId, teamId, teamName],
  )
  const { messages, sendMessage, status, error } = useChat({ transport })
  const [input, setInput] = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)
  const isLoading = status === "submitted" || status === "streaming"

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    sendMessage({ text: input })
    setInput("")
  }

  return (
    <div className="flex flex-col flex-1 gap-4 overflow-hidden">
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg p-4 shrink-0">
        <h2 className="text-lg font-semibold text-slate-200">Hero Counters Assistant</h2>
        <p className="text-slate-400 text-sm mt-1">
          Ask about hero matchups, counters, and draft strategies for your AD2L games.
        </p>
      </div>

      <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg flex flex-col flex-1 overflow-hidden">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <div className="text-3xl">🛡️</div>
              <p className="text-slate-400 text-sm max-w-sm">
                Ask me anything about Dota 2 hero counters and draft strategy. For example: "What heroes counter Phantom Assassin?" or "How do I draft against an Ursa?"
              </p>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {message.role === "assistant" && (
                <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white shrink-0 mt-0.5">
                  AI
                </div>
              )}
              <div
                className={`max-w-[75%] rounded-lg px-4 py-2.5 text-sm leading-relaxed ${
                  message.role === "user"
                    ? "bg-blue-600 text-white rounded-br-sm"
                    : "bg-slate-700 text-slate-200 rounded-bl-sm"
                }`}
              >
                {message.parts.map((part, i) =>
                  part.type === "text" ? (
                    <ReactMarkdown
                      key={i}
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                        em: ({ children }) => <em className="italic">{children}</em>,
                        ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>,
                        li: ({ children }) => <li className="leading-snug">{children}</li>,
                        h1: ({ children }) => <h1 className="text-base font-bold mb-1 mt-2">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-sm font-bold mb-1 mt-2">{children}</h2>,
                        h3: ({ children }) => <h3 className="text-sm font-semibold mb-1 mt-2">{children}</h3>,
                        code: ({ children, className }) =>
                          className ? (
                            <code className="block bg-slate-900/60 rounded px-3 py-2 text-xs font-mono my-2 overflow-x-auto">
                              {children}
                            </code>
                          ) : (
                            <code className="bg-slate-900/60 rounded px-1 py-0.5 text-xs font-mono">{children}</code>
                          ),
                        blockquote: ({ children }) => (
                          <blockquote className="border-l-2 border-slate-500 pl-3 italic text-slate-300 my-2">
                            {children}
                          </blockquote>
                        ),
                        hr: () => <hr className="border-slate-600 my-2" />,
                        a: ({ href, children }) => (
                          <a href={href} className="text-blue-400 underline hover:text-blue-300" target="_blank" rel="noreferrer">
                            {children}
                          </a>
                        ),
                      }}
                    >
                      {part.text}
                    </ReactMarkdown>
                  ) : null,
                )}
              </div>
              {message.role === "user" && (
                <div className="w-7 h-7 rounded-full bg-slate-600 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0 mt-0.5">
                  You
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
                AI
              </div>
              <div className="bg-slate-700 rounded-lg rounded-bl-sm px-4 py-2.5">
                <div className="flex gap-1 items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" />
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="text-red-400 text-sm text-center py-2">
              Something went wrong. Please try again.
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-slate-700 p-3">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about hero counters or draft strategy..."
              className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium transition-colors"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
