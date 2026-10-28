import { useMemo } from 'react';
import { ELayoutElement } from 'services/layout';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import { isMultichatSupported } from 'components-react/editor/elements/multichat-support';

/**
 * Whether the layout of the current tab puts anything worth showing in the dock. Multichat is not
 * shown in the dock when logged out or on platforms that don't support it, so a dock that only
 * holds Multichat has nothing to show. Other elements don't need a login.
 */
export function useDockHasContent() {
  const { LayoutService, UserService } = Services;
  const { dockElements, multichatSupported } = useVuex(() => ({
    dockElements: LayoutService.views.dockElements,
    multichatSupported: isMultichatSupported(UserService.views.platform),
  }));

  const dockKey = dockElements.join();
  return useMemo(
    () => dockElements.some(element => element !== ELayoutElement.Multichat || multichatSupported),
    [dockKey, multichatSupported],
  );
}
