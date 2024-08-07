import { MessageResponse } from '../ChatMessage';
import {
  isChatMessage,
  isGameUpdateMessage,
  isGiftMessage,
  isNicoadMessage,
  isNotificationMessage,
  isOperatorMessage,
  isSignalMessage,
  isStateMessage,
} from './util';

/**
 * chatメッセージの表示パターン及び文言組み立てパターン振り分け用識別器
 * @param chat ChatMessage
 */
export function classify(chat: MessageResponse) {
  if (isChatMessage(chat)) {
    return 'normal' as const;
  }
  if (isOperatorMessage(chat)) {
    return 'operator' as const;
  }
  if (isNotificationMessage(chat)) {
    switch (chat.notification.type) {
      case 'ichiba':
        return 'system' as const;
      case 'quote':
        return 'system' as const;
      case 'emotion':
        return 'emotion' as const;
      case 'cruise':
        return 'system' as const;
      case 'programExtended':
        return 'info' as const;
      case 'rankingIn':
        return 'info' as const;
      case 'rankingUpdated':
        return 'info' as const;
      case 'visited':
        return 'info' as const;
    }
  }
  if (isGiftMessage(chat)) return 'gift' as const;
  if (isNicoadMessage(chat)) return 'nicoad' as const;
  if (isGameUpdateMessage(chat)) return 'gameUpdate' as const;
  if (isStateMessage(chat)) return 'invisible' as const;
  if (isSignalMessage(chat)) return 'invisible' as const;
  return 'unknown' as const;
}

export type ChatMessageType = ReturnType<typeof classify> | 'n-air-emulated';
