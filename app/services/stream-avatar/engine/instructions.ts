import type { GameState } from './game-state';

let _instructions: Record<string, string> = {};
export const setInstructions = (map: Record<string, string>) => {
  _instructions = map;
};
export const getInstruction = (type: string): string | undefined => _instructions[type];

export function interpolateInstruction(instruction: string, state: GameState): string {
  return instruction
    .replace('{elimination_count}', String(state.eliminations))
    .replace('{players_remaining}', String(state.playersRemaining));
}
