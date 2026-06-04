import type { GameState } from '../game-state';
import { Properties } from '../properties';

/**
 * Reusable condition building blocks.
 *
 * The vast majority of per-game conditions are small variations on the same few
 * shapes (a one-shot game event firing, a health/shield threshold, an
 * elimination tally). Rather than re-implement those inline in every game file,
 * games compose them from the helpers below — keeping each game file to a single
 * readable line per condition while remaining free to inline a bespoke
 * `evaluate` whenever a game needs something custom.
 */

type EvalArgs<P> = { state: GameState; prevState: GameState; props: P };

/** Fires on the tick a one-shot game event is queued. */
export const onEvent = (event: string) => ({ state }: { state: GameState }): boolean =>
  state.pendingEvents.has(event);

/** Player is alive but in the danger zone (health below 50). */
export const lowHealth = ({ state }: { state: GameState }): boolean => {
  const { health = 0 } = state;
  return health > 0 && health < 50;
};

/** Player currently has shield. */
export const hasShield = ({ state }: { state: GameState }): boolean => (state.shield ?? 0) > 0;

/** Player has no shield left. */
export const noShield = ({ state }: { state: GameState }): boolean => (state.shield ?? 0) === 0;

/** Shared "Enemy Elimination Count" condition with an adjustable range. */
export const eliminationCount = () => ({
  label: 'Enemy Elimination Count',
  properties: {
    elimination_count: new Properties.SliderRange({
      label: '# of Eliminations',
      min: 0,
      max: 50,
      default: [5, 5],
      step: 1,
    }),
  },
  evaluate: ({ state, prevState, props }: EvalArgs<{ elimination_count?: [number, number] }>) => {
    const [min, max] = props?.elimination_count ?? [5, 5];
    const { eliminations = 0 } = state;
    const { eliminations: prevEliminations = 0 } = prevState;
    return eliminations >= min && prevEliminations <= max;
  },
});

/** Shared "Players Remaining" condition; `sliderMax` caps the lobby size per game. */
export const playersRemaining = (sliderMax: number) => ({
  label: 'Players Remaining (coming soon)',
  disabled: true,
  properties: {
    players_remaining: new Properties.SliderRange({
      label: '# of Players Remaining',
      min: 1,
      max: sliderMax,
      default: [1, 1],
      step: 1,
    }),
  },
  evaluate: ({ state, props }: EvalArgs<{ players_remaining?: [number, number] }>) => {
    const [min, max] = props?.players_remaining ?? [1, 1];
    const { playersRemaining: remaining = 0 } = state;
    return remaining >= min && remaining <= max;
  },
});
