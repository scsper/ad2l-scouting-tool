import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { Provider } from "react-redux"
import { ClerkProvider } from "@clerk/react"
import { BrowserRouter } from "react-router"
import { App } from "./App"
import { store } from "./app/store"
import "./index.css"

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string

if (!publishableKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in .env.local")
}

const container = document.getElementById("root")

if (container) {
  const root = createRoot(container)

  root.render(
    <StrictMode>
      {/* Clerk sits above the router so navigating a tab never remounts the
          auth state, and `afterSignOutUrl` stays "/" on purpose: signing out
          should not leave you parked on a deep link you can no longer read. */}
      <ClerkProvider publishableKey={publishableKey} afterSignOutUrl="/">
        <Provider store={store}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </Provider>
      </ClerkProvider>
    </StrictMode>,
  )
} else {
  throw new Error(
    "Root element with ID 'root' was not found in the document. Ensure there is a corresponding HTML element with the ID 'root' in your HTML file.",
  )
}
