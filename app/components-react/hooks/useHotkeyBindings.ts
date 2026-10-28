import { useVuex } from 'components-react/hooks';
import { Services } from 'components-react/service-provider';
import { getHotkeyHash, IHotkey } from 'services/hotkeys';

/** Read bindings from mirrored worker state, never from an editor's initial snapshot. */
export function useHotkeyBindings(hotkey: IHotkey) {
  return useVuex(() => ({
    bindings: [
      ...(Services.HotkeysService.state.hotkeys.find(
        saved => getHotkeyHash(saved) === getHotkeyHash(hotkey),
      )?.bindings ?? []),
    ],
  })).bindings;
}
