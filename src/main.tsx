import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { Provider } from "react-redux"
import { ClerkProvider } from "@clerk/react"
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
      <ClerkProvider publishableKey={publishableKey} afterSignOutUrl="/">
        <Provider store={store}>
          <App />
        </Provider>
      </ClerkProvider>
    </StrictMode>,
  )
} else {
  throw new Error(
    "Root element with ID 'root' was not found in the document. Ensure there is a corresponding HTML element with the ID 'root' in your HTML file.",
  )
}
