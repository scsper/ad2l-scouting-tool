import { Show, SignInButton } from "@clerk/react"
import { Outlet } from "react-router"

/**
 * The shell and the auth gate.
 *
 * Sign-in opens as a modal so the URL never unloads: a shared deep link handed
 * to someone signed out has to still be the link they land on once they are
 * signed in, and a redirect round-trip is one more thing that can lose it.
 */
export const RootLayout = () => (
  <div className="App flex flex-col h-screen overflow-hidden">
    <Show when="signed-out">
      <div className="flex flex-col items-center justify-center h-[calc(100vh-48px)] gap-3">
        <p className="text-slate-300 text-lg font-medium">
          Please sign in to continue
        </p>
        <SignInButton mode="modal">
          <button className="px-5 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors">
            Sign in
          </button>
        </SignInButton>
      </div>
    </Show>

    <Show when="signed-in">
      <Outlet />
    </Show>
  </div>
)
