import { isWrappedChat, WrappedMessage } from '../WrappedChat';

export function getDisplayName(chat: WrappedMessage): string {
  if (!isWrappedChat(chat)) {
    return '';
  }
  if (chat.filtered) {
    return undefined;
  }
  return chat.value.name;
}
