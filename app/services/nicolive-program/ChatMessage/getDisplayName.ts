import { WrappedChat } from '../WrappedChat';

export function getDisplayName(chat: WrappedChat): string {
  if (chat.filtered) {
    return undefined;
  }
  return chat.value.name;
}
