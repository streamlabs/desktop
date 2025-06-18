import React, { useState, useEffect } from 'react';
import { IHotkey, IBinding } from 'services/hotkeys';
import cx from 'classnames';
import styles from './Hotkey.m.less';
import HotkeyBinding from 'components-react/shared/HotkeyBinding';
import { Services } from 'components-react/service-provider';

/**
 * Represents a binding that has a unique key for CSS animations
 */
interface IKeyedBinding {
  binding: IBinding;
  key: string;
}

interface HotkeyProps {
  hotkey: IHotkey;
}

// This is kind of weird, but the key attribute allows
// us to uniquely identify that binding in the DOM,
// which allows CSS animations to work properly.
function createBindingWithKey(binding: IBinding): IKeyedBinding {
  return {
    binding,
    key: Math.random().toString(36).substring(2, 15),
  };
}

function getBlankBinding() {
  return {
    key: '',
    modifiers: {
      alt: false,
      ctrl: false,
      shift: false,
      meta: false,
    },
  };
}

function addEmptyBindingAt(index: number) {
  return (bindings: IKeyedBinding[]) => {
    const newBindings = [...bindings];
    newBindings.splice(index + 1, 0, createBindingWithKey(getBlankBinding()));
    return newBindings;
  };
}

function removeBindingAt(index: number) {
  return (bindings: IKeyedBinding[]) => {
    const newBindings = [...bindings];
    // If this is the last binding, replace it with an
    // empty binding instead.
    if (newBindings.length === 1) {
      newBindings[0].binding = getBlankBinding();
    } else {
      newBindings.splice(index, 1);
    }

    return newBindings;
  };
}

function setBindingAtIndex(index: number, binding: IBinding) {
  return (bindings: IKeyedBinding[]) => {
    const newBindings = [...bindings];
    newBindings.splice(index, 1, createBindingWithKey(binding));
    return newBindings;
  };
}

export default function Hotkey(props: HotkeyProps) {
  const { hotkey } = props;

  const [bindings, setBindings] = useState<IKeyedBinding[]>(() => {
    // Create a blank binding if there are no bindings
    const initialBindings = hotkey.bindings.length ? hotkey.bindings : [getBlankBinding()];

    return initialBindings.map(createBindingWithKey);
  });

  /**
   * Adds a new blank binding
   */
  function addBinding(index: number) {
    return setBindings(addEmptyBindingAt(index));
  }

  function removeBinding(index: number) {
    return setBindings(removeBindingAt(index));
  }

  // TODO: can we possibly avoid mutation in the future?
  useEffect(() => {
    hotkey.bindings = bindings.map(b => b.binding);
  }, [bindings]);

  function HotkeyBindings({ bindings }: { bindings: IKeyedBinding[] }) {
    const setBinding = (index: number, binding: IBinding) => {
      setBindings(setBindingAtIndex(index, binding)(bindings));
      if (hotkey.partnerId) {
        Services.HotkeysService.actions.setHotkeyPartnerBinding(hotkey);
      }
    };

    return (
      <div className={styles.hotkeyBindings}>
        {bindings.map((binding, index) => (
          <div key={binding.key} className={styles.hotkeyBinding}>
            <HotkeyBinding
              hotkey={hotkey}
              binding={binding.binding}
              onBind={(binding: IBinding) => {
                setBinding(index, binding);
              }}
            />
            <div className={styles.hotkeyControls}>
              <i
                data-testid="add-binding"
                className={cx(styles.hotkeyControl, 'fa', 'fa-plus')}
                onClick={() => addBinding(index)}
              />
              <i
                data-testid="remove-binding"
                className={cx(styles.hotkeyControl, 'fa', 'fa-minus')}
                onClick={() => removeBinding(index)}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const description = hotkey.description || '';
  const testId = description.replace(/\s+/, '_');

  return (
    <div className={styles.hotkey} data-testid={testId}>
      <HotkeyBindings bindings={bindings} />
    </div>
  );
}
