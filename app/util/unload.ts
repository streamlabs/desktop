import Utils from 'services/utils';

/**
 * Helper for registering an action that needs to be performed on window refresh
 * @returns a function to cancel the unload operation
 */
export function onUnload(fun: () => void) {
  // This line was commented because without it in production build 'close' event is
  // not fired for projector window immediately when it is closed, but fired on app close
  //if (!Utils.isDevMode()) return () => {};

  window.addEventListener('beforeunload', fun);

  return () => window.removeEventListener('beforeunload', fun);
}
