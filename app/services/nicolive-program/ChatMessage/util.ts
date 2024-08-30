import {
  ChatMessage,
  GameUpdateMessage,
  GiftMessage,
  MessageResponse,
  NicoadMessage,
  NicoadMessageV0,
  NicoadMessageV1,
  NotificationMessage,
  OperatorMessage,
  SignalMessage,
  StateMessage,
} from '../ChatMessage';

export function isPremium(chat: ChatMessage): boolean {
  return !!chat.premium;
}

export function isAnonymous(chat: ChatMessage): boolean {
  return chat.anonymity === 1;
}

export function getScore(chat: ChatMessage): number {
  return chat.score ?? 0;
}

export function isChatMessage(msg: MessageResponse): msg is { chat: ChatMessage } {
  return msg.hasOwnProperty('chat');
}

export function isOperatorMessage(msg: MessageResponse): msg is { operator: OperatorMessage } {
  return msg.hasOwnProperty('operator');
}

export function isNotificationMessage(
  msg: MessageResponse,
): msg is { notification: NotificationMessage } {
  return msg.hasOwnProperty('notification');
}

export function isGiftMessage(msg: MessageResponse): msg is { gift: GiftMessage } {
  return msg.hasOwnProperty('gift');
}

export function isNicoadMessage(msg: MessageResponse): msg is { nicoad: NicoadMessage } {
  return msg.hasOwnProperty('nicoad');
}

export function isNicoadMessageV0(msg: NicoadMessage): msg is NicoadMessageV0 {
  return msg.hasOwnProperty('v0');
}

export function isNicoadMessageV1(msg: NicoadMessage): msg is NicoadMessageV1 {
  return msg.hasOwnProperty('v1');
}

export function isGameUpdateMessage(
  msg: MessageResponse,
): msg is { gameUpdate: GameUpdateMessage } {
  return msg.hasOwnProperty('gameUpdate');
}

export function isStateMessage(msg: MessageResponse): msg is { state: StateMessage } {
  return msg.hasOwnProperty('state');
}

export function isSignalMessage(msg: MessageResponse): msg is { signal: SignalMessage } {
  return msg.hasOwnProperty('signal');
}
