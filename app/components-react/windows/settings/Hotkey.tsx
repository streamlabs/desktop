import React from 'react';
import { IHotkey, THotkeyBindingEdit } from 'services/hotkeys';
import cx from 'classnames';
import styles from './Hotkey.m.less';
import HotkeyBinding from 'components-react/shared/HotkeyBinding';
import { Services } from 'components-react/service-provider';
import { useHotkeyBindings } from 'components-react/hooks/useHotkeyBindings';

export default function Hotkey({ hotkey }: { hotkey: IHotkey }) {
  const savedBindings = useHotkeyBindings(hotkey);
  const bindings = savedBindings.length
    ? savedBindings
    : [{ key: '', modifiers: { alt: false, ctrl: false, shift: false, meta: false } }];

  async function editBinding(edit: THotkeyBindingEdit) {
    await Services.HotkeysService.actions.return.editBinding(hotkey, edit);
  }

  const testId = (hotkey.description || '').replace(/\s+/, '_');

  return (
    <div className={styles.hotkey} data-testid={testId}>
      <div className={styles.hotkeyBindings}>
        {bindings.map((binding, index) => (
          // Preserve the input while its value changes, including until key release.
          <div key={index} className={styles.hotkeyBinding}>
            <HotkeyBinding
              hotkey={hotkey}
              binding={binding}
              onBind={binding => editBinding({ type: 'set', index, binding })}
            />
            <div className={styles.hotkeyControls}>
              <i
                data-testid="add-binding"
                className={cx(styles.hotkeyControl, 'fa', 'fa-plus')}
                onClick={() => editBinding({ type: 'insert', index })}
              />
              <i
                data-testid="remove-binding"
                className={cx(styles.hotkeyControl, 'fa', 'fa-minus')}
                onClick={() => editBinding({ type: 'remove', index })}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
