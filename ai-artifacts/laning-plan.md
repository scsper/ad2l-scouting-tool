# Plan: Lane Win Analysis UI for League Matches

## Status: Exploring codebase
## Overview
Build a new UI component in the "Lanes" tab that displays lane-by-lane performance for league matches, showing teams, date, and each player's gold, XP, and tower damage at 10 minutes into the game. This will help analyze which lanes were won or lost.

### Current Phase: Understanding existing structure
- Investigating league match data structures
- Finding player statistics and game metrics
- Understanding UI component patterns
## Key Discovery
OpenDota API **already provides** time-series data (`gold_t`, `xp_t`, `times` arrays) with 60-second intervals, but this data is **not currently being parsed or stored**. The arrays provide values at [0, 60, 120, ..., 600] seconds, so we can extract the 10-minute (600s) value at index 10.

## Implementation Approach

### Phase 1: Extend Data Pipeline (Backend)
Add 10-minute snapshot data collection and storage.

**1.1 Database Schema Extension**
Add new columns to the `match_player` table:
- `gold_at_10` (integer, nullable)
- `xp_at_10` (integer, nullable)  
- `last_hits_at_10` (integer, nullable)
- `denies_at_10` (integer, nullable)

**Migration SQL:**
```sql
ALTER TABLE match_player 
ADD COLUMN gold_at_10 INTEGER,
ADD COLUMN xp_at_10 INTEGER,
ADD COLUMN last_hits_at_10 INTEGER,
ADD COLUMN denies_at_10 INTEGER;
```

**1.2 Update TypeScript Types**
File: `/types/db.ts`
- Add the four new fields to `MatchPlayerRow` type

**1.3 Extend OpenDota Response Type**
File: `/scripts/match-operations.ts`
- Add to `OpenDotaPlayer` type:
  ```typescript
  times?: number[]
  gold_t?: number[]
  xp_t?: number[]
  lh_t?: number[]
  dn_t?: number[]
  ```

**1.4 Add 10-Minute Data Extraction Function**
File: `/scripts/match-operations.ts`

Create a new helper function:
```typescript
function get10MinuteStats(player: OpenDotaPlayer): {
  goldAt10: number | null
  xpAt10: number | null
  lastHitsAt10: number | null
  deniesAt10: number | null
} {
  if (!player.times || !player.gold_t || !player.xp_t) {
    return { goldAt10: null, xpAt10: null, lastHitsAt10: null, deniesAt10: null }
  }
  
  // Find index for 600 seconds (10 minutes)
  const index10Min = player.times.findIndex(t => t === 600)
  if (index10Min === -1) return { goldAt10: null, xpAt10: null, lastHitsAt10: null, deniesAt10: null }
  
  return {
    goldAt10: player.gold_t[index10Min] ?? null,
    xpAt10: player.xp_t[index10Min] ?? null,
    lastHitsAt10: player.lh_t?.[index10Min] ?? null,
    deniesAt10: player.dn_t?.[index10Min] ?? null,
  }
}
```

**1.5 Update Player Transform Logic**
File: `/scripts/match-operations.ts`
- In `transformOpenDotaMatch()`, call `get10MinuteStats(player)` for each player
- Add the stats to the `Player` type and return object

**1.6 Update Database Insert**
File: `/scripts/match-operations.ts`
- In `convertMatchDataToMatchPlayersTable()`, add the new fields when creating `MatchPlayerRow` objects

### Phase 2: Create Lane Analysis Logic (Utils)

**2.1 Create Lane Analysis Utility**
New File: `/src/utils/lane-analysis.ts`

Functions to implement:
```typescript
// Pair up opposing laners based on position and lane
export function analyzeLaneMatchups(
  radiantPlayers: MatchPlayerRow[],
  direPlayers: MatchPlayerRow[]
): LaneMatchup[]

// Calculate lane winner based on gold/XP/CS advantage
export function calculateLaneWinner(
  player1: MatchPlayerRow,
  player2: MatchPlayerRow
): 'player1' | 'player2' | 'even'

// Calculate advantage metrics
export function calculateAdvantage(
  player1: MatchPlayerRow,
  player2: MatchPlayerRow
): {
  goldAdvantage: number
  xpAdvantage: number
  csAdvantage: number
}
```

**Lane Pairing Strategy:**
- Match by position first: POS_1 vs POS_1, POS_2 vs POS_2, etc.
- For supports (POS_4, POS_5), pair within the same lane if possible
- Mid lane (POS_2) always pairs mid vs mid

**Lane Win Calculation (Weighted Score):**
- Gold advantage at 10min: 50% weight (>150 gold = significant)
- XP advantage at 10min: 30% weight (>300 XP = ~1 level)
- CS advantage at 10min: 20% weight (>15 CS = significant)
- Combined threshold: >250 score = won, <-250 = lost, otherwise even

### Phase 3: Build Lanes UI Component

**3.1 Create Lanes Component**
New File: `/src/features/lanes/Lanes.tsx`

Component structure:
```tsx
export const Lanes = ({ leagueId, teamId }: { leagueId: number, teamId: number }) => {
  const { data: matchesData, isLoading, isError } = useGetMatchesQuery({ leagueId, teamId })
  
  // For each match:
  // - Display match header (teams, date, result)
  // - Show lane matchups in grid layout (5 lanes: carry, mid, off, sup4, sup5)
  // - Display gold@10, XP@10, tower damage, CS@10 for each player
  // - Highlight lane winners with color coding
}
```

**Layout Pattern:**
- Follow existing card structure: `bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700`
- Use responsive grid: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5` for lane matchups
- Color scheme: Green for won lanes, red for lost lanes, gray for even

**3.2 Update App.tsx**
File: `/src/App.tsx`
- Import the new `Lanes` component
- Replace the placeholder in the lanes tab:
  ```tsx
  {activeTab === "lanes" && leagueId && teamId && (
    <Lanes leagueId={leagueId} teamId={teamId} />
  )}
  ```

### Phase 4: Display Enhancements

**4.1 Lane Matchup Card Design**
Each lane matchup shows:
- Lane/Position label (e.g., "Carry Lane", "Mid Lane")
- Two player sections (Radiant vs Dire, or Your Team vs Opponent)
- Hero portraits/names
- Stats at 10 minutes:
  - Gold: `2,450g` with delta `(+150)`
  - XP: `3,200 XP` with delta `(+300)`
  - CS: `45/3` (LH/D) with delta `(+10)`
- Tower damage: Total for match displayed separately
- Winner indicator: Border color or badge

**4.2 Match Summary Section**
At the top of each match card:
- Teams and date (reuse existing pattern from `/src/features/matches/matches.tsx`)
- Lane win summary: "3-2 Lanes Won" with visual indicator
- Link to Dotabuff (existing pattern)

**4.3 Empty State Handling**
If 10-minute data is not available (for old matches):
- Show message: "10-minute statistics not available for this match"
- Fall back to showing match-wide GPM/XPM as reference
- Label clearly as "Match Average" not "10 Min"

### Phase 5: Tower Damage Integration

**Tower Damage Display:**
- Note: Tower damage is **total for match**, not at 10 minutes
- Display separately with label "Total Tower Damage"
- Show in lane matchup card but clearly differentiated
- Consider it as a tie-breaker indicator for lane pressure

## Critical Files to Modify

1. **Database Migration:**
   - New file: `/migrations/add_10min_stats.sql`

2. **Backend/Data Pipeline:**
   - `/types/db.ts` - Add 10-min fields to MatchPlayerRow
   - `/scripts/match-operations.ts` - Extract and store 10-min data from OpenDota

3. **Frontend:**
   - `/src/utils/lane-analysis.ts` - NEW: Lane pairing and win calculation logic
   - `/src/features/lanes/Lanes.tsx` - NEW: Main lanes UI component
   - `/src/App.tsx` - Import and render Lanes component

## Incremental Implementation Path

**Step 1: Backend Data Pipeline**
1. Create database migration
2. Update types in `db.ts`
3. Add 10-min extraction logic in `match-operations.ts`
4. Test with a single match to verify data is stored

**Step 2: Basic UI (Using Existing Data)**
1. Create Lanes.tsx with basic layout
2. Display matches without 10-min data (use GPM/XPM averages)
3. Integrate into App.tsx
4. Verify UI structure and styling

**Step 3: Full Lane Analysis**
1. Re-parse existing matches to populate 10-min data
2. Create lane-analysis.ts utility
3. Update Lanes.tsx to show lane matchups with 10-min stats
4. Add winner highlighting and advantage indicators

**Step 4: Polish**
1. Add loading states and error handling
2. Refine color scheme and visual indicators
3. Add tooltips for stat explanations
4. Test with multiple matches and edge cases

## Verification Steps

After implementation:
1. **Data Check:** Query database to verify 10-min fields are populated
2. **UI Test:** Navigate to Lanes tab and verify matches display
3. **Lane Pairing:** Verify laners are correctly matched (mid vs mid, carry vs carry, etc.)
4. **Win Calculation:** Manually verify lane winner calculation for a few matches
5. **Edge Cases:** Check matches with missing data, roaming supports, position swaps
6. **Responsive Design:** Test on different screen sizes (mobile, tablet, desktop)

## Technical Considerations

**Data Availability:**
- Old matches may not have `gold_t`/`xp_t` arrays (graceful fallback needed)
- Some matches might not reach 10 minutes (very short games)
- Index for 10 minutes might vary (search for closest to 600 seconds)

**Lane Assignment:**
- Jungle/Roaming positions may not have direct lane matchups
- Position detection is heuristic-based (may not be 100% accurate)
- Some metas have dual offlane or trilane setups (handle gracefully)

**Performance:**
- Time-series arrays are large; only extract what's needed during parsing
- Don't fetch full arrays to frontend; pre-compute at 10-min mark
- Consider pagination if showing many matches (reuse existing patterns)

## Styling Consistency

Follow existing patterns from codebase:
- **Colors:** slate-800/50 backgrounds, slate-700 borders, blue-400 accents
- **Spacing:** p-4, p-6 for cards, gap-4 for grids, space-y-2/4 for lists
- **Responsive:** Mobile-first with md:/lg: breakpoints
- **Interactive:** hover:bg-slate-700/50, transition-all
- **Typography:** text-sm for details, text-base for titles, font-medium/bold for emphasis

## Success Criteria

✅ Lanes tab shows all league matches with lane-by-lane breakdown
✅ Each player displays gold, XP, and CS at 10 minutes
✅ Tower damage (total) is displayed for context
✅ Lane winners are clearly indicated with visual highlighting
✅ Empty states handled gracefully for matches without 10-min data
✅ UI follows existing design patterns and is responsive
✅ Component integrates with existing RTK Query architecture
