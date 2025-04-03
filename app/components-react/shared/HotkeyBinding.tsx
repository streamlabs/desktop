import React, { useRef, useState } from 'react';
import { IBinding, IHotkey } from 'services/hotkeys';
import { TextInput } from 'components-react/shared/inputs';
import { byOS, OS } from 'util/operating-systems';
import Form from './inputs/Form';
import { Input } from 'antd';
import { Services } from 'components-react/service-provider';

/**
 * Turns a binding into a string representation
 */
export function getBindingString(binding: IBinding) {
  const keys: string[] = [];

  if (binding.modifiers.alt) keys.push(byOS({ [OS.Windows]: 'Alt', [OS.Mac]: 'Opt' }));
  if (binding.modifiers.ctrl) keys.push('Ctrl');
  if (binding.modifiers.shift) keys.push('Shift');
  if (binding.modifiers.meta) keys.push(byOS({ [OS.Windows]: 'Win', [OS.Mac]: 'Cmd' }));

  let key = binding.key;

  const matchDigit = binding.key.match(/^Digit([0-9])$/);
  if (matchDigit) key = matchDigit[1];

  const matchKey = binding.key.match(/^Key([A-Z])$/);
  if (matchKey) key = matchKey[1];

  if (key === 'MiddleMouseButton') key = 'Mouse 3';
  if (key === 'X1MouseButton') key = 'Mouse 4';
  if (key === 'X2MouseButton') key = 'Mouse 5';

  keys.push(key);

  return keys.join('+');
}

function getHotkeyString(binding: IBinding | null, focused = false) {
  if (focused) return 'Press any key combination...';

  if (binding?.key) {
    return `${getBindingString(binding)} (Click to re-bind)`;
  } else {
    return 'Click to bind';
  }
}

function isModifierPress(event: React.KeyboardEvent<HTMLInputElement>) {
  return (
    event.key === 'Control' || event.key === 'Alt' || event.key === 'Meta' || event.key === 'Shift'
  );
}

function getModifiers(
  event: React.KeyboardEvent<HTMLInputElement> | React.MouseEvent<HTMLInputElement>,
) {
  return {
    alt: event.altKey,
    ctrl: event.ctrlKey,
    shift: event.shiftKey,
    meta: event.metaKey,
  };
}

export default function HotkeyBinding(p: {
  hotkey: IHotkey;
  binding: IBinding | null;
  onBind: (binding: IBinding) => void;
  style?: React.CSSProperties;
  showLabel?: boolean;
}) {
  const { MarkersService, DualOutputService } = Services;

  const [focused, setFocused] = useState(false);
  const inputRef = useRef<Input>(null);

  const hotKeyLabel = p.showLabel !== false ? <HotkeyLabel /> : <></>;
  const showDualOutputLabel =
    DualOutputService.views.dualOutputMode &&
    p?.hotkey.actionName !== 'SWITCH_TO_SCENE' &&
    p.hotkey?.sceneItemId;

  function handlePress(event: React.KeyboardEvent<HTMLInputElement>) {
    // We don't allow binding a modifier by instelf
    if (isModifierPress(event) || !focused) return;

    event.preventDefault();

    p.onBind({
      key: event.code,
      modifiers: getModifiers(event),
    });
    if (inputRef.current) inputRef.current.blur();
  }

  function handleClick(event: React.MouseEvent<HTMLInputElement>) {
    const key = event.button;
    const isPrimaryButton = key === 0 || key === 2;
    if (!focused || isPrimaryButton) return;

    event.preventDefault();

    const code = {
      1: 'MiddleMouseButton',
      3: 'X1MouseButton',
      4: 'X2MouseButton',
    };

    p.onBind({
      key: code[key],
      modifiers: getModifiers(event),
    });
    if (inputRef.current) inputRef.current.blur();
  }

  function handleLabel(value: string) {
    MarkersService.actions.setMarkerName(p.hotkey.actionName, value);
  }

  function HotkeyLabel() {
    if (!p.hotkey.isMarker) return <>{p.hotkey.description || ''}</>;
    return (
      <TextInput
        value={MarkersService.views.getLabel(p.hotkey.actionName)}
        onChange={handleLabel}
        nowrap
      />
    );
  }

  function DualOutputHotkeyLabel() {
    const icon = p.hotkey?.display === 'vertical' ? 'icon-phone-case' : 'icon-desktop';
    if (!p.hotkey.isMarker) {
      return (
        <>
          <i className={icon} style={{ margin: '5px', opacity: 0.6 }} />
          {p.hotkey.description || ''}
        </>
      );
    }
    return (
      <>
        <i className={icon} style={{ margin: '5px', opacity: 0.6 }} />
        <TextInput
          value={MarkersService.views.getLabel(p.hotkey.actionName)}
          onChange={handleLabel}
          nowrap
        />
      </>
    );
  }

  return (
    <Form layout="inline">
      <TextInput
        name="binding"
        style={{ width: 400, ...p.style }}
        label={showDualOutputLabel ? <DualOutputHotkeyLabel /> : hotKeyLabel}
        value={getHotkeyString(p.binding, focused)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={handlePress}
        onMouseDown={handleClick}
        inputRef={inputRef}
      />
    </Form>
  );
}
