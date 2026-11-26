export interface StreamAlert {
  /** Raw socket event type, e.g. 'donation', 'subscription', 'subMysteryGift', 'raid' */
  type: string;
  name: string;
  amount: number;
  months: number;
  streakMonths: number;
  /** Lowercased sub plan: '1000' | '2000' | '3000' | 'prime' */
  subPlan: string;
  gifter?: string;
  raiders: number;
  recurring: boolean;
  /** Largest donation this stream before this alert (for largest_of_stream) */
  previousLargestDonation: number;
  /** Source platform (`e.for ?? 'streamlabs'`), e.g. 'twitch', 'youtube_account', 'streamlabs' */
  platform: string;
  /** Raw `sub_type`, e.g. 'primepaidupgrade' */
  subType?: string;
  /** YouTube membership level (numeric) */
  level?: number;
  /** YouTube membership level name (also gifted membership level name) */
  levelName?: string;
  /** Merch product name or loyalty store item name */
  product?: string;
  /** Loyalty store item type */
  productType?: string;
  /** Prime sub gift type */
  giftType?: string;
  powerUpId?: string;
  powerUpName?: string;
  /** TikTok jewel gift name */
  giftName?: string;
  /** TikTok jewel gift combo count */
  combo?: number;
  /** Facebook support: gift redeemed */
  gift?: boolean;
  /** Follow/subscription streak counter after this alert this stream; 0 when the alert doesn't count */
  streakCount: number;
}

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

  /** Set only during stream-alert evaluation passes */
  alert?: StreamAlert;
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
