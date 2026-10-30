import { useMemo } from 'react';
import { ELayoutElement } from 'services/layout';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import { isMultichatSupported } from 'components-react/editor/elements/multichat-support';

/**
 * Whether the layout of the current tab puts anything worth showing in the dock. Multichat is not
 * shown in the dock on platforms that don't support it, so a dock that only holds Multichat has
 * nothing to show.
 */
export function useDockHasContent() {
  const { LayoutService, UserService } = Services;
  const { dockElements, platform } = useVuex(() => ({
    dockElements: LayoutService.views.dockElements,
    platform: UserService.views.platform,
  }));

  const dockKey = dockElements.join();
  return useMemo(
    () =>
      dockElements.some(
        element => element !== ELayoutElement.Multichat || isMultichatSupported(platform),
      ),
    [dockKey, platform?.type],
  );
}
