import { Show, SignInButton } from "@clerk/react"
import { Outlet } from "react-router"
import { useGetMeQuery } from "../features/access/access-api"

/**
 * The screen a signed-in account with no grants gets.
 *
 * Not an edge case: it is the state of the captain's account for the minutes
 * between them signing up and the grant script being run, and the permanent
 * state of a revoked one. Without it the app renders normally with empty
 * pickers, which reads as an outage — and this is the first thing a new user
 * ever sees, so it decides whether they message you "it's broken" or "I'm
 * signed up, ready when you are".
 */
const NoAccess = () => (
  <div className="flex flex-col items-center justify-center h-[calc(100vh-48px)] gap-3">
    <p className="text-slate-300 text-lg font-medium">
      Your account isn&apos;t set up yet
    </p>
    <p className="text-slate-400 text-sm max-w-md text-center">
      You&apos;re signed in, but no division has been shared with you. Ask Scott
      to grant access — nothing is broken.
    </p>
  </div>
)

const LoadingAccess = () => (
  <div className="flex items-center justify-center h-[calc(100vh-48px)] gap-3">
    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
    <span className="text-slate-400">Loading...</span>
  </div>
)

/**
 * The shell, the auth gate, and now the access gate.
 *
 * Sign-in opens as a modal so the URL never unloads: a shared deep link handed
 * to someone signed out has to still be the link they land on once they are
 * signed in, and a redirect round-trip is one more thing that can lose it.
 *
 * `api/me` is awaited here rather than deeper down because three things need
 * it before any screen renders — this gate, the landing redirect at `/`, and
 * whether to offer "Add team" — and one fetch at the top is cheaper than the
 * same question asked three times. It does cost everyone a spinner on first
 * paint where there used to be none.
 */
const SignedIn = () => {
  const { data: me, isLoading, isError } = useGetMeQuery()

  if (isLoading) return <LoadingAccess />

  // A failed `api/me` is not a permission answer, so it must not render as one.
  // Falling through to the app means the individual screens report their own
  // errors, which is the behaviour that existed before this gate.
  if (!isError && me && !me.hasAccess) return <NoAccess />

  return <Outlet />
}

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
      <SignedIn />
    </Show>
  </div>
)
