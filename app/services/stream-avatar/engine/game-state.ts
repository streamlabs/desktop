export interface GameState {
  state: string;
  frame?: string;

  health: number;
  shield: number;

  eliminations: number;
  totalEliminations: number;

  teamScore: number;
  opponentScore: number;

  playersRemaining: number;

  pendingEvents: ReadonlySet<string>;
}

export const defaultGameState: GameState = {
  state: 'stopped',
  frame: undefined,
  health: 100,
  shield: 100,
  eliminations: 0,
  totalEliminations: 0,
  teamScore: 0,
  opponentScore: 0,
  playersRemaining: 0,
  pendingEvents: new Set(),
};
