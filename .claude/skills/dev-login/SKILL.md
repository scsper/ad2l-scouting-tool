---
name: dev-login
description: "Sign an agent-driven browser into the local app past the Clerk gate, so a change can be checked in the running UI instead of only in tests. Use whenever you need to see the app, click through a flow, or exercise an authenticated API route locally."
user-invocable: true
---

# dev-login

The app is behind a Clerk sign-in gate, and `api/parse-match` and `api/team` verify
the session token server-side. A headless browser therefore sees "Please sign in to
continue" and nothing else — no tab, no data, no way to reach the write paths.

This gets you a real session without a password or an emailed code.

## How it works

`scripts/dev-login.ts` asks the Clerk Backend API for a **sign-in token** — a one-shot
ticket for an existing user — and the browser redeems it for a genuine session. The app
is unmodified: there is no dev bypass, no test-only branch, and the session that comes
out is the same one a human gets, so token-verifying API routes work too.

The ticket is single-use and expires in 10 minutes. The script refuses to run against a
`sk_live_` key, so it can only ever touch the development instance.

Sign-up on the instance is restricted, so the user has to already exist. It defaults to
`scsper@gmail.com` (the owner); pass an email to pick someone else.

## Running it

Two servers, because `vercel dev` alone can't serve the app. Its rewrite in `vercel.json`
sends everything that isn't `/api` to `index.html`, which also swallows Vite's own
`/@vite/client` and `/src/main.tsx` requests — the page loads and then never boots, with
three 500s in the console. So Vite serves the app and proxies `/api` to a `vercel dev`
next to it (see `server.proxy` in `vite.config.ts`).

```bash
npm run dev:api &   # vercel dev on 3001 — runs api/
npm run dev         # vite on 5173 — serves the app, proxies /api
```

Then sign the browser in:

```bash
TICKET=$(npm run --silent dev-login -- --json | python3 -c "import sys,json; print(json.load(sys.stdin)['ticket'])")

npx -y chrome-devtools-axi open http://localhost:5173

npx -y chrome-devtools-axi eval "async () => {
  await window.Clerk.load();
  if (window.Clerk.user) return window.Clerk.user.primaryEmailAddress?.emailAddress + ' (already)';
  const r = await window.Clerk.client.signIn.create({ strategy: 'ticket', ticket: '$TICKET' });
  await window.Clerk.setActive({ session: r.createdSessionId });
  return window.Clerk.user?.primaryEmailAddress?.emailAddress;
}"
```

A successful run returns the email. The session persists across reloads *and across ports*
— the Clerk cookie is set on `localhost`, which cookies scope without regard to port — so
you generally sign in once per browser session. The `already` guard is there because
redeeming a ticket on top of a live session fails with "You're already signed in", which
reads like a broken ticket when it isn't.

To force a clean run:

```bash
npx -y chrome-devtools-axi eval "async () => { await window.Clerk.signOut(); return 'signed out' }"
```

`npm run dev-login` with no `--json` prints that same snippet with the ticket already
substituted, for pasting into a devtools console by hand.

## Checking it worked

`snapshot` right after `open` often shows an empty page — Clerk and React are still
booting. Wait first:

```bash
npx -y chrome-devtools-axi wait 3000
npx -y chrome-devtools-axi snapshot
```

Signed in, you should see the league dropdown populated from the database. If you see
"Please sign in to continue", the ticket expired or was already spent — mint another.

To confirm the token actually reaches an authenticated route:

```bash
npx -y chrome-devtools-axi eval "async () => {
  const t = await window.Clerk.session.getToken();
  const r = await fetch('/api/team?leagueId=19554', { headers: { Authorization: 'Bearer ' + t } });
  return r.status;
}"
```

## Gotchas

- **`window.Clerk` is undefined.** You're on `vercel dev` (port 3000 via `npm start`),
  not Vite. Check the console for the three 500s described above.
- **Port already in use.** Other Conductor workspaces run their own servers.
  `VERCEL_DEV_PORT` moves the API server; `npm run dev -- --port N` moves the app.
  If Vite falls back off 5173, the proxy still works — only the URL changes.
- **`vercel link` rewrites `.env.local`.** It drops any key not set on the Vercel project
  — `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` are local-only and will vanish. Back the file
  up first, or copy it back from another checkout of this repo, which is the only other
  place those two keys exist.
- **`vercel dev` without a `.vercel/` link creates a Vercel project** named after the
  directory, so running it in a Conductor workspace makes a junk project per workspace.
  Link to `ad2l-scouting-tool` first.
