/** chatメッセージ（取得形のみ） */

type DateComponent = {
  date?: number;
  date_usec?: number;
};

export type ChatMessage = DateComponent & {
  id?: string; // meta.id
  content?: string;
  no?: number;
  premium?: number;
  thread?: number;
  user_id?: string;
  vpos?: number;
  anonymity?: number;
  mail?: string;
  score?: number;
  name?: string;
};

export type OperatorMessage = DateComponent & {
  content?: string;
  link?: string;
  mail?: string;
  name?: string;
};

export const NotificationTypeTable = [
  'ichiba',
  'quote',
  'emotion',
  'cruise',
  'programExtended',
  'rankingIn',
  'rankingUpdated',
  'visited',
] as const;

export type NotificationType = (typeof NotificationTypeTable)[number];
export type NotificationMessage = DateComponent & {
  type: NotificationType;
  message: string;
};

export type GiftMessage = DateComponent & {
  itemId?: string;
  advertiserUserId?: number;
  advertiserName?: string;
  point?: number;
  message?: string;
  itemName?: string;
  contributionRank?: number;
};

export type NicoadMessage = NicoadMessageV0 | NicoadMessageV1;

export type NicoadMessageV0 = DateComponent & {
  v0: {
    latest?: {
      advertiser?: string;
      point?: number;
      message?: string;
    };
    ranking?: {
      advertiser?: string;
      rank?: number;
      message?: string;
      userRank?: number;
    }[];
    totalPoint?: number;
  };
};
export type NicoadMessageV1 = DateComponent & {
  v1: {
    totalAdPoint?: number;
    message?: string;
  };
};

export type GameUpdateMessage = DateComponent & {};

export type StateMessage = DateComponent & {
  state: 'ended';
};

export type SignalMessage = 'flushed';

export type MessageResponse =
  | { chat: ChatMessage }
  | { operator: OperatorMessage }
  | { notification: NotificationMessage }
  | { gift: GiftMessage }
  | { nicoad: NicoadMessage }
  | { gameUpdate: GameUpdateMessage }
  | { state: StateMessage }
  | { signal: SignalMessage };
