import { createContext } from 'react';

/**
 * A context that allows individual steps to specify custom skip actions without having to render a button.
 */
type SkipHandler = {
  /**
   * @returns true if we should run the default skip after, false to skip the default, and undefined if the skip was not attempted.
   */
  onSkip: () => boolean | undefined;
};

// TODO: consider using `useCallback` on callers, optimization, etc.
export const SkipContext = createContext<SkipHandler>({
  onSkip: () => true,
});
