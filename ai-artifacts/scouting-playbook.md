# Scouting Playbook

The question sequence that produced the Sharkhorse vs Random Gaming scout (AD2L S47,
2026-07-31 — won 2-0). Ordered as a workflow, not chronologically. Each entry notes what it
actually yielded so you can skip the low-value ones under time pressure.

Verdict column: ✅ held up against the real games · ⚠️ mixed · ❌ misled me.

---

## Phase 1 — Get the data honest before analysing it

**1. "Pull all data you have on all matches and players for both teams."** ✅
Baseline. Immediately surfaced that opponents can have **two team IDs** (Random Gaming was
both `9408493` for S45/S46 and `10142791` for S47, with a nearly different roster). Always
check `team` for duplicate names before trusting a record.

**2. "Ignore [old season]. Repull the players because they have changed."** ✅
The `player` table is hand-maintained and goes stale. Compare it against who *actually
appears* in recent `match_player` rows — I found 2 registered players who never play and 2
unregistered players who started every game.

**3. "Which registered players are missing pub stats?"** ✅
Catches expired API tokens early. Stratz returns **HTTP 403 "a bearer token is required"**
when the JWT expires — identical to sending no token — so it reads like a missing header.
Decode the `exp` claim to confirm. **OpenDota needs no token** and covers the same ground:
`/players/{id}`, `/players/{id}/heroes?date=90`, `/players/{id}/recentMatches`.

---

## Phase 2 — Frame the matchup

**4. "What's the record split by season / by roster era?"** ✅
Separates the team you're facing from the team that shares its name.

**5. "What are the common opponents and each team's record against them?"** ✅ **highest yield**
Far more predictive than head-to-head. Sharkhorse 8-1 vs the shared field, RG 11-8. Also
exposes the tell — one opponent (Savage Sabres) beat RG four times and showed how.

**6. "Analyse the lineups they've won and lost with. What's the record split?"** ✅
Found their 6-1 lineup depended on two players who then didn't play. **Correct a premise if
the data contradicts it** — I was told a player joined on a date that the data disproved.

**7. "Lane performance @10min by position, ours vs theirs."** ✅
gold@10 / xp@10 differentials by position. Identified mid as the lane to concede and their
pos 4 as the lane to attack. Note: `lane_outcome` is often `UNKNOWN`; use the gold/xp deltas.

---

## Phase 3 — Archetypes (handle with care)

**8. "What lineups / hero archetypes have done well against them?"** ⚠️
Aggregate every hero drafted against them by attack type, primary attribute, and role tag.
Produced the ranged-beats-melee finding. **Over-extrapolated in the end** — see Phase 6.

**9. "Split that by position — p1 only, p2 only, p3 only."** ✅ **essential follow-up**
The pooled result was carried almost entirely by p1. p2/p3 were underpowered and p4/p5
reversed. *Never trust a pooled archetype result without the positional split.*

**10. "What lineups did [hero X] lose in?"** ✅ **the most valuable question asked**
Killed a finding I had called "the most important lines in this document." Underlord 0-3 and
Centaur 0-2 turned out to be **one weak offlaner on one bad team, plus a player who'd left
the roster**. Always ask *who* was piloting before believing a hero-level record.

**11. "Specifically look at games with a ranged p1."** ✅
Refined "ranged" into **attack range ≥575** (Drow/Clinkz/Medusa/Muerta), a cleaner and more
significant cut than the ranged/melee binary.

**12. "What lineups beat that plan?"** ✅
Inverting the question found Undying as their one answer to a ranged draft — and that both
its pilots were unavailable at the time.

**13. "What midlaners have been most successful?"** ✅ **negative results are results**
Answer: none. Winning mid correlated with *nothing* (4-7 vs 4-6). Confirmed the plan to
concede mid. Don't manufacture a recommendation when the data says the lane doesn't matter.

---

## Phase 4 — Players and pools

**14. "Scout player {steam_id}."** ✅
Rank tier, 90-day volume and win rate, all-time vs recent pool, and the **core/support
split**. Caught one candidate who was a Spectre core who had stopped playing support five
months earlier — he played pos 4 in the real games and posted the two worst lanes on his team.

**15. "Analyse player {id} *as a support*."** ✅
Role-specific framing matters. Check `last_played` per hero — a 195-game signature hero
untouched for five months is not a threat.

**16. "What heroes from our pool are good against {their carries}?"** ✅
Dotabuff counters pages, cross-referenced against your players' actual league + pub pools.
Only 5 of the top 15 counters existed anywhere in the roster — that's the useful output.

**17. "What are the best {our player} heroes against {their player}'s pool?"** ⚠️
Weight their heroes by likelihood, then score yours. Directionally useful, but see Phase 6:
it's conditioned on them picking what you expect.

---

## Phase 5 — Draft mechanics (high yield, low effort)

**18. "Analyse their draft order. Which position do they pick first? What order do they take
their cores?"** ✅
Avg pick slot by position revealed a rigid **p5 → p4 → p3 → p1 → p2**. Held exactly in the
real games. Tells you which of their players you'll see before you commit yours.

**19. "Break the pick order down by first pick vs second pick."** ✅
Exposed the CM snake (`R . . R R . . R R .` vs `. R R . . R R . . R`) and that they save mid
for last when picking second. Also: they were 10-2 with first pick, 3-6 without — **but that
was confounded with side**, so state it as a lean.

**20. "Here's the gameplan: [...]. Validate it."** ✅ **run this before every match**
Catching that the ban list funnelled their carry into a hero that beat three of our planned
picks was worth more than any single stat.

**21. "In light of the plan, analyse the games we just played."** ✅
Closes the loop and tells you which analyses to trust next time.

---

## Phase 6 — What actually held up

Validated against the 2-0 on 2026-07-31:

| Held | Failed |
|---|---|
| Player-specific ban targets (Lina + Death Prophet → 27 deaths across 2 games) | "Bring 2+ ranged cores" — ran 1/3 and 0/3, won both |
| "Don't spend a ban on Elder Titan, they'll ban it" — they did, both games | "Avoid Centaur / Underlord" — played both, won both |
| Drow priority — +1105 lane, and they banned it next game | "Demote Dawnbreaker" — played both, +732 lane |
| Draft-order prediction — exact | |
| Player scouting (the core-on-support underperformed badly) | |

**The lesson:** analyses grounded in *a specific player's own league and pub record* held up.
Analyses built on **aggregate archetype statistics over ~20 games** did not. Hero-matchup
percentages are conditioned on the opponent actually picking that hero — three of my picks
were wrong because they banned their own Lifestealer.

Weight in this order: **the player's own record → their team's draft habits → hero matchup
tables → archetype aggregates.**

---

## Data traps found the hard way

- **`match_player.player_name` changes between matches.** One account appeared as "w",
  "Board Executive", and "Blackacre"; another as "Lucky :}", "Lucky", and "Zen". **Always
  aggregate by `player_id`** and resolve the display name from the most recent match.
- **`position` was derived wrong.** `getPositionString` ranked farm against all five
  teammates on full-game GPM, so a high-GPM support could steal `POSITION_3`. Fixed in
  `scripts/match-operations.ts` (compare only lane-mates, rank by lh@10) with tests. Audit
  with: within a team, does the labelled p4 out-farm the labelled p3 at 10 min?
- **Two teams can share a name.** Check `team` for duplicates.
- **Dotabuff is Cloudflare-protected.** Headless gets 403; `browse --headed` gets 200. Pass
  `--headed` on *every* command once the daemon starts in that mode.
- Small samples: at ~21 games a per-position split is only ~21 picks. Run Fisher's exact
  before believing a split, and say so when it fails.

---

## Scripts

Written to `.context/` during the S47 scout — **gitignored, so they vanish with the
workspace**. Worth promoting to `scripts/` if you want them durable:

| Script | Purpose |
|---|---|
| `dump-teams.ts` / `summarize.ts` | full team + roster + draft dump |
| `actual-rosters.ts` | registered roster vs who actually plays |
| `opendota-pubs.ts` | pub data without a Stratz token |
| `common-opponents.ts` | shared-opponent records |
| `lanes-and-h2h.ts` | lane deltas @10 and head-to-head detail |
| `archetype-by-position.ts` | archetype split by position |
| `rg-draft-order.ts` / `rg-draft-split.ts` | draft order, split by first/second pick |
| `analyze-player.ts` | single-player scout (rank, pools, core/support split) |
| `position-audit.ts` / `audit-all-positions.ts` | p3/p4 mislabel audit |
| `parse-counters.py` | parse Dotabuff counters pages |
