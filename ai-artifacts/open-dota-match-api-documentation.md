# Dota 2 Match API Response Summary

This document summarizes the **structure and information categories**
contained in a Dota 2 match API response (similar to OpenDota).\
The example response appears to be mostly empty placeholders, but the
schema reveals all possible data fields.

------------------------------------------------------------------------

# Match Summary (High-Level)

-   **Match ID:** 3703866531
-   **Winner:** Radiant (`radiant_win: true`)
-   **Radiant Score:** 0
-   **Dire Score:** 0
-   **Duration:** 0 seconds (not populated)
-   **Game Mode:** 0
-   **Region:** 0
-   **Cluster (server):** 0
-   **Lobby Type:** 0
-   **Patch Version:** 0
-   **First Blood Time:** 0

------------------------------------------------------------------------

# Teams

The response contains metadata for:

-   **Radiant Team:** `{}` (empty)
-   **Dire Team:** `{}` (empty)
-   **League:** `{}` (not populated)

------------------------------------------------------------------------

# Draft Information

Two arrays describe the hero drafting phase.

## Picks / Bans

`picks_bans`

Each entry includes:

-   `is_pick` --- pick vs ban
-   `hero_id`
-   `team`
-   `order`

Example:

    Team 0 picked hero 0

## Draft Timings

`draft_timings`

Tracks:

-   Pick/ban order
-   Which team acted
-   Hero selected
-   Time taken to decide

------------------------------------------------------------------------

# Match Timeline Metrics

## Gold Advantage

`radiant_gold_adv`

Array showing **Radiant gold lead over time**.

Example:

    [0]

## XP Advantage

`radiant_xp_adv`

Tracks **experience advantage throughout the match**.

------------------------------------------------------------------------

# Map Objectives

## Towers

-   `tower_status_radiant`
-   `tower_status_dire`

Bitmasks indicating which towers are alive.

## Barracks

-   `barracks_status_radiant`
-   `barracks_status_dire`

Bitmasks indicating destroyed barracks.

## Objectives

`objectives`

Tracks events such as:

-   tower kills
-   Roshan kills
-   barracks destroyed

(Currently empty)

------------------------------------------------------------------------

# Teamfights

`teamfights`

Captures large fights including:

-   damage dealt
-   heroes involved
-   outcomes

(Currently empty)

------------------------------------------------------------------------

# Chat

`chat`

Tracks in-game chat messages.

Structure:

-   `time`: when message happened
-   `unit`: who said it
-   `key`: message content
-   `slot` / `player_slot`: player reference

------------------------------------------------------------------------

# Pause Events

`pauses`

Tracks game pauses.

Example:

    pause at time 0
    duration 0

------------------------------------------------------------------------

# Player Data

The `players` array contains **detailed statistics for each of the 10
players**.

Example player:

    personaname: "420 booty wizard"
    isRadiant: true
    hero_id: 0

------------------------------------------------------------------------

# Core Player Stats

For each player:

## Combat

-   `kills`
-   `deaths`
-   `assists`
-   `hero_damage`
-   `hero_healing`
-   `tower_damage`

## Economy

-   `gold`
-   `gold_per_min`
-   `total_gold`
-   `gold_spent`

## Experience

-   `xp_per_min`
-   `total_xp`

## Farming

-   `last_hits`
-   `denies`
-   `neutral_kills`
-   `ancient_kills`

------------------------------------------------------------------------

# Vision

Ward usage and placement:

-   `obs_placed`
-   `sen_placed`
-   `observer_uses`
-   `sentry_uses`
-   `obs_log`
-   `sen_log`

------------------------------------------------------------------------

# Item Data

## Inventory

Players have:

    item_0
    item_1
    item_2
    item_3
    item_4
    item_5
    backpack_0
    backpack_1
    backpack_2

## Purchases

Tracked via:

-   `purchase`
-   `purchase_log`
-   `purchase_time`
-   `first_purchase_time`

------------------------------------------------------------------------

# Abilities

Ability usage tracking:

-   `ability_upgrades_arr`
-   `ability_uses`
-   `ability_targets`

------------------------------------------------------------------------

# Damage Breakdown

Detailed damage metrics:

-   `damage_targets`
-   `damage_inflictor`
-   `damage_taken`
-   `damage_inflictor_received`

------------------------------------------------------------------------

# Kill Logs

Detailed kill events:

-   `kills_log`
-   `kill_streaks`
-   `multi_kills`
-   `killed`
-   `killed_by`

------------------------------------------------------------------------

# Rune Usage

Tracks rune pickups:

-   `rune_pickups`
-   `runes`
-   `runes_log`

------------------------------------------------------------------------

# Lane Information

Each player includes:

-   `lane`
-   `lane_role`
-   `lane_efficiency`
-   `lane_efficiency_pct`
-   `is_roaming`

------------------------------------------------------------------------

# Neutral Items

Tracks neutral item acquisition:

-   `neutral_tokens_log`
-   `neutral_item_history`

------------------------------------------------------------------------

# Cosmetics

Players may have equipped cosmetic items:

Fields include:

-   `item_name`
-   `item_rarity`
-   `image_path`
-   `used_by_heroes`

------------------------------------------------------------------------

# Advanced Metrics

Includes:

-   `actions_per_min`
-   `kills_per_min`
-   `kda`
-   `benchmarks`
-   `rank_tier`

------------------------------------------------------------------------

# Misc Match Metrics

Analytical indicators:

-   `throw` --- if a team threw a lead
-   `comeback` --- comeback win
-   `loss`
-   `win`

------------------------------------------------------------------------

# Replay

Replay metadata:

-   `replay_url`
-   `replay_salt`

------------------------------------------------------------------------

# Overall Summary

This API response provides **complete telemetry for a Dota 2 match**,
including:

1.  Match metadata (duration, mode, region)
2.  Draft phase (picks, bans, timing)
3.  Timeline metrics (gold/xp advantage)
4.  Objective events (towers, Roshan)
5.  Teamfight breakdowns
6.  Full player statistics
7.  Item builds
8.  Ability usage
9.  Vision control
10.  Detailed damage logs
11.  Chat messages
12.  Replay data
