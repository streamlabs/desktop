/**
 * Which scene the streamer is "on", for ending a request where they were.
 *
 * The streamer switches scenes by hand too, so this can't come from the conversation. The rule:
 * the scene on screen when a tour of switches starts is home. A tour starts when the scene on
 * screen isn't the one we last switched to (they moved), or we haven't switched in a while.
 */

/** Longer than this between switches: a new tour (the streamer may have moved meanwhile). */
const TOUR_GAP_MS = 120_000;

let home: { id: string; name: string } | null = null;
let lastSwitchedTo: string | null = null;
let lastSwitchAt = 0;

function tourActive(activeId: string): boolean {
  return lastSwitchedTo === activeId && Date.now() - lastSwitchAt <= TOUR_GAP_MS;
}

/** Call just before switching away from `active`. */
export function beforeSwitch(active: { id: string; name: string }): void {
  if (!home || !tourActive(active.id)) home = { id: active.id, name: active.name };
}

/** Call right after switching to `to`. */
export function afterSwitch(toId: string): void {
  lastSwitchedTo = toId;
  lastSwitchAt = Date.now();
}

/** The scene to end on, given the scene on screen now. */
export function homeFor(active: { id: string; name: string }): { id: string; name: string } {
  return tourActive(active.id) && home ? home : active;
}

/** One line for tool results: where to end, from the scene on screen now. */
export function whereToEnd(active: { id: string; name: string }): string {
  const h = homeFor(active);
  return h.id === active.id
    ? `The streamer is on "${active.name}": end here (no switch_scene needed).`
    : `The streamer was on "${h.name}": when you are done, switch_scene back to "${h.name}".`;
}
