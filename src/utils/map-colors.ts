/**
 * Every colour either map tab draws with, in one place.
 *
 * This file exists because the palette used to live in three: `PlaybackLayer`
 * and `TowerLayer` each declared their own identical own/enemy pair, and the
 * Movement legend expressed the same two colours a third time as Tailwind
 * classes. Nothing kept them in agreement, so a change applied to the constants
 * left the legend confidently labelling the map with the opposite key.
 *
 * The scheme is two independent channels:
 *
 *   outline = allegiance   (blue = the team being scouted, red = the enemy)
 *   fill    = identity     (which hero, observer vs sentry, standing vs fallen)
 *
 * Keeping them independent is what lets a mark answer both questions at once —
 * a blue ring around an amber dot is our observer, a red ring around the same
 * dot is theirs — without a colour having to mean two things.
 */

/**
 * Allegiance, always relative to the team you are scouting — never Radiant and
 * Dire. Blue is the team under the microscope on every tab, in every game,
 * whichever side they drew; the question is always "us".
 *
 * Note this is the opposite of the pre-existing convention, which had the
 * scouted team in red. Scouting notes get read next to a draft, and a team you
 * are studying reading as the "threat" colour was backwards.
 */
export const SCOUTED_COLOR = "#60a5fa" // blue-400
export const ENEMY_COLOR = "#f87171" // red-400

/**
 * Ward identity.
 *
 * Observers keep amber. Sentries were `sky-400` (#38bdf8) and are now near
 * white, because sentries acquired a blue team ring at the same time this
 * palette was consolidated — and a blue ring around a blue fill at r=3.5 is an
 * indistinct smudge at exactly the moment "is that sentry ours or theirs" is
 * the question being asked. White also happens to match the in-game model.
 *
 * The Tailwind swatches beside the ward toggles in `Wards.tsx` are driven from
 * these constants rather than restated as classes, for the reason in the file
 * comment above.
 */
export const OBSERVER_COLOR = "#fbbf24" // amber-400
export const SENTRY_COLOR = "#e2e8f0" // slate-200

/** Neutral objectives belong to nobody, so they take no allegiance ring. */
export const ROSHAN_COLOR = "#fbbf24"
export const TORMENTOR_COLOR = "#c084fc"

/**
 * Drawn under every mark before the mark itself.
 *
 * The minimap runs from bright jungle to near-black river, and any single fill
 * colour disappears against one end or the other. A dark halo underneath is
 * what makes one palette legible over all of the terrain.
 */
export const HALO_COLOR = "#020617"
