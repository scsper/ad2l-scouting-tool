import react from "@vitejs/plugin-react"
import * as path from "node:path"
import { defineConfig } from "vitest/config"
import packageJson from "./package.json" with { type: "json" }

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  server: {
    open: true,

    // `npm start` runs the whole thing through `vercel dev`, which is the only
    // way to execute `api/`. But its rewrite in vercel.json — everything that
    // isn't /api goes to index.html — also swallows Vite's own dev requests for
    // /@vite/client and /src/main.tsx, so the page loads and then never boots.
    //
    // `npm run dev` sidesteps that by serving the app itself and forwarding only
    // /api to a `vercel dev` on VERCEL_DEV_PORT. Nothing is proxied if that
    // server isn't running, which is fine: you get the UI and failed API calls,
    // exactly what you had before.
    proxy: {
      "/api": {
        target: `http://localhost:${process.env.VERCEL_DEV_PORT ?? "3001"}`,
        changeOrigin: true,
      },
    },
  },

  test: {
    root: import.meta.dirname,
    name: packageJson.name,
    environment: "jsdom",

    typecheck: {
      enabled: true,
      tsconfig: path.join(import.meta.dirname, "tsconfig.json"),
    },

    globals: true,
    watch: false,
    setupFiles: ["./src/setupTests.ts"],
  },
})
