import type { GameState } from './game-state';

let _instructions: Record<string, string> = {};
export const setInstructions = (map: Record<string, string>) => {
  _instructions = map;
};
export const getInstruction = (type: string): string | undefined => _instructions[type];

export function interpolateInstruction(instruction: string, state: GameState): string {
  const values: Record<string, string | number> = {
    elimination_count: state.eliminations,
    players_remaining: state.playersRemaining,
  };
  if (state.alert) {
    Object.assign(values, {
      name: state.alert.name,
      amount: state.alert.amount,
      months: state.alert.months,
      raiders: state.alert.raiders,
      count: state.alert.streakCount,
    });
  }

  // split/join replaces every occurrence and never reads $ patterns in donor names.
  return Object.keys(values).reduce(
    (result, key) => result.split(`{${key}}`).join(String(values[key])),
    instruction,
  );
}
