import { ChatMessageType } from './classifier';

export type ChatComponentType = 'common' | 'nicoad' | 'gift' | 'emotion' | 'system';

export const chatComponentTypeMap: {
  [type in ChatMessageType]: ChatComponentType;
} = {
  normal: 'common',
  operator: 'common',
  nicoad: 'nicoad',
  gift: 'gift',
  emotion: 'emotion',
  system: 'system',
  info: 'system',
  unknown: 'system',
  gameUpdate: 'system',
  'n-air-emulated': 'system',
  // コンポーネントに届く前にフィルタされて表示されないが念のため対応させておく
  invisible: 'system',
} as const;

export function AddComponent<T extends { type: ChatMessageType }>(
  chat: T,
): T & { component: ChatComponentType } {
  return { ...chat, component: chatComponentTypeMap[chat.type] };
}
