import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { Provider } from "react-redux"
import { MemoryRouter, Route, Routes } from "react-router"
import { makeStore } from "../app/store"
import { stubFetch } from "../utils/test-fetch"
import { RootLayout } from "./RootLayout"

vi.mock("@clerk/react", () => ({
  Show: ({ when, children }: { when: string; children: ReactNode }) => (
    <>{when === "signed-in" ? children : null}</>
  ),
  SignInButton: () => null,
  UserButton: () => null,
  useAuth: () => ({ getToken: () => Promise.resolve("token") }),
}))

function renderShell(me: unknown) {
  stubFetch({ "api/me": me })

  return render(
    <Provider store={makeStore()}>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route element={<RootLayout />}>
            <Route index element={<span>the app</span>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("RootLayout", () => {
  it("renders the app for a provisioned account", async () => {
    renderShell({
      isAdmin: false,
      grants: [{ leagueId: 19555, division: "Warrior" }],
      hasAccess: true,
    })
    expect(await screen.findByText("the app")).toBeInTheDocument()
  })

  // The state of a new account for the minutes between signing up and the grant
  // script being run, and the permanent state of a revoked one. Without this it
  // renders as the normal app with every dropdown empty, which reads as an
  // outage — and it is the first screen a new user ever sees.
  it("explains itself to a signed-in account with no grants", async () => {
    renderShell({ isAdmin: false, grants: [], hasAccess: false })

    expect(
      await screen.findByText("Your account isn't set up yet"),
    ).toBeInTheDocument()
    expect(screen.queryByText("the app")).not.toBeInTheDocument()
  })

  it("lets an admin through", async () => {
    renderShell({ isAdmin: true, grants: [], hasAccess: true })
    expect(await screen.findByText("the app")).toBeInTheDocument()
  })
})
