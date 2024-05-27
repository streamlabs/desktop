import { ChatMessage } from './ChatMessage';
import { ChatMessageType } from './ChatMessage/classifier';
import { ChatComponentType } from './ChatMessage/ChatComponentType';

export type WrappedChat = {
  type: ChatMessageType;
  value: ChatMessage;
  seqId: number;
  /** NG追加したときに手元でフィルタをかけた結果 */
  filtered?: boolean;
  rawName?: string; // ピン留めコメント用にnameを保存
  isModerator?: boolean;
  isSupporter?: boolean;
};

export type WrappedChatWithComponent = WrappedChat & { component: ChatComponentType };
