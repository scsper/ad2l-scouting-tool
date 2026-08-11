---
name: grant-access
description: "Give someone access to the app — either full admin, or scoped to a single division of a single league. Use when adding a new user, restricting an existing one, revoking access, or working out why a signed-in account sees nothing."
user-invocable: true
---

# grant-access

Access is **closed by default**. A signed-in Clerk user with no row in `app_user` sees
nothing at all — no leagues, no teams, an "Your account isn't set up yet" screen. That is
working as designed, not a bug, and it is the first thing to check when someone reports
an empty app.

There are exactly two kinds of access:

| Kind | What they see | How it's stored |
| --- | --- | --- |
| **Admin** | Everything, in every league, forever | `app_user.is_admin = true` |
| **Scoped** | One division of one league, per grant row | rows in `user_league_access` |

Admin is deliberately *not* "a grant for all leagues". If it were, every new league —
including the one-off pro leagues added to read a draft — would need a grant row before it
appeared, and a missing grant under a closed default looks exactly like a bug.

## Before anything else

The person must already exist in Clerk. **Sign-up on the instance is restricted**, so they
cannot self-serve: invite them from the Clerk dashboard first. `npm run grant` refuses an
email with no Clerk account rather than filing a grant against nobody.

The script reads `.env.local` itself (`CLERK_SECRET_KEY`, `SUPABASE_DOTA2_*`). No exports
needed.

## See who has what

```bash
npm run grant -- --list
```

Prints every provisioned account and its scope. If it says *"No users provisioned.
Everyone is locked out, including you"*, nobody can use the app — including you — and the
fix is the admin command below.

## Add an admin

```bash
npm run grant -- --email someone@example.com --admin
```

## Add someone scoped to one division

```bash
npm run grant -- --email captain@example.com --league 19555 --division Warrior
```

`--division` must be one of the names in `shared/divisions.ts` (Voyager, Challenger,
Warrior, Conqueror). The script rejects anything else, because an unrecognised name
matches no team and would silently grant nothing.

**Grants stack.** Run it again with a different league or division to add a second slice —
a captain who plays Warrior this season and Conqueror next needs two rows, and the
division dropdown just renders both.

## Revoke

```bash
npm run grant -- --email someone@example.com --revoke
```

Deletes the `app_user` row; the grants cascade. They go back to the state a brand-new
account is in.

## The trap: demoting an admin to scoped

`--admin` only ever *raises* the flag, and granting a division does not lower it. So this
does nothing visible:

```bash
npm run grant -- --email them@example.com --league 19555 --division Warrior   # still admin!
```

Revoke first, then grant:

```bash
npm run grant -- --email them@example.com --revoke
npm run grant -- --email them@example.com --league 19555 --division Warrior
```

Dropping someone from admin is destructive enough to be worth doing deliberately, rather
than as a side effect of handing them a division.

## Why a scoped user sees nothing

In order of likelihood:

1. **No team in that league carries that division.** Divisions live in
   `league_teams.division`, and a grant naming a bracket no team is in shows an empty app.
   `npm run grant` warns about this at grant time. Seed divisions with
   `scripts/add-teams-to-league.ts`, which takes one `DIVISION` constant per run.
2. **The team's division is NULL.** Unassigned teams are invisible to scoped users — NULL
   is not a bracket anyone was granted. From an admin account they look fine, filed under
   "Unassigned — not visible to scoped users" in the team dropdown, which is the only
   place the problem is visible at all.
3. **They were never granted anything.** `--list` settles it in one command.

## What a scoped user cannot do

- **See any other league.** Not just other divisions — a grant is `(league, division)`, so
  Seasons 45–47 and the Scrims league are admin-only unless explicitly granted. This is
  load-bearing: those leagues have no divisions at all, so a division filter over them
  would filter nothing.
- **Add a team** (`POST api/team`). Admin-only, because that route's upsert *sets*
  `division`, which is the key a grant is checked against — anyone allowed to call it
  could move another division's team into their own and then read it.
- **Parse a match outside their division**, or edit a roster outside it. Both are allowed
  within it.

Pub stats (`api/player`, `api/player-pub-matches`) are readable by any signed-in user by
design: they are keyed on a public Steam account id with no league context, and the data
is public Dota data anyone can pull from OpenDota themselves.

## Where the rules actually live

`server/access-scope.ts` — pure decision functions (admin bypass, NULL exclusion,
multi-grant matching), with exhaustive tests in `access-scope.test.ts`. `server/access.ts`
resolves a Clerk token into a scope and does the DB-backed checks. Change behaviour there,
not in the routes; the routes each call it in two lines.

The schema and the reasoning behind closed-by-default are in
`migrations/create_user_access.sql`.
