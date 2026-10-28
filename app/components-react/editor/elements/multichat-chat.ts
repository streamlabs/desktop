import { initStore } from 'components-react/hooks/zustand';

/**
 * Which chat Multichat is showing: `default`, `restream` or the id of a platform app. It is shared
 * with the dock header so "Refresh Chat" refreshes whichever chat is visible.
 */
export const multichatChat = initStore({
  selectedChat: 'default',
});
