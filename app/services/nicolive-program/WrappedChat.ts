import { ChatMessage, GiftMessage, NicoadMessage } from './ChatMessage';
import { ChatMessageType } from './ChatMessage/classifier';
import { ChatComponentType } from './ChatMessage/ChatComponentType';

/**
 * ピン留め、モデレーターフラグ保持などが可能なタイプのメッセージ(ChatMessage)を type, seqIdをつけてラップする
 */
export type WrappedChat = {
  type: Exclude<ChatMessageType, 'nicoad' | 'gift'>;
  value: ChatMessage;
  seqId: number;
  /** NG追加したときに手元でフィルタをかけた結果 */
  filtered?: boolean;
  rawName?: string; // ピン留めコメント用にnameを保存
  isModerator?: boolean;
  isSupporter?: boolean;
};

/**
 * WrappedChat に加えて、ニコニ広告、ギフトなどのメッセージを type, seqIdをつけてラップしたものを含む型。
 * WrappedMessageはすべてコメント一覧表示可能・読み上げ可能だが、フィルター、なふだやピン留めの対象になるのは WrappedChat のみ。
 */
export type WrappedMessage =
  | WrappedChat
  | {
      type: 'nicoad';
      value: NicoadMessage;
      seqId: number;
    }
  | {
      type: 'gift';
      value: GiftMessage;
      seqId: number;
    };

/** WrappedMessageのうち WrappedChat に該当するかどうかを判定する */
export function isWrappedChat(chat: Pick<WrappedMessage, 'type' | 'value'>): chat is WrappedChat {
  return chat.type !== 'nicoad' && chat.type !== 'gift';
}

export type WrappedChatWithComponent = WrappedChat & { component: ChatComponentType };
export type WrappedMessageWithComponent = WrappedMessage & { component: ChatComponentType };
