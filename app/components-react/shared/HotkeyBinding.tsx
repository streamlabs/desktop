import React, { useEffect, useRef, useState, useMemo, memo, useCallback } from 'react';
import uuid from 'uuid/v4';
import { IBinding, IHotkey } from 'services/hotkeys';
import { TextInput } from 'components-react/shared/inputs';
import { byOS, OS } from 'util/operating-systems';
import Form from './inputs/Form';
import { Input } from 'antd';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';

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
  onBind: (binding: IBinding) => void | Promise<void>;
  style?: React.CSSProperties;
  showLabel?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<Input>(null);
  const captureRef = useRef<{
    token: string;
    pending: Promise<unknown>;
    binding?: IBinding;
    mouseButton?: number;
  } | null>(null);

  const releaseCapture = useCallback(() => {
    const capture = captureRef.current;
    if (!capture) return;
    captureRef.current = null;
    // Wait for pending requests before releasing this token,
    // even if the input closes before the worker replies.
    capture.pending
      .catch(error => console.error('Could not update hotkey binding', error))
      .then(() => Services.HotkeysService.actions.endCapture(capture.token));
  }, []);

  function cancelCapture() {
    releaseCapture();
    setFocused(false);
  }

  function beginCapture() {
    if (captureRef.current) return;
    // A fresh token keeps cleanup from an earlier capture from ending this one.
    const token = uuid();
    const pending = Services.HotkeysService.actions.return.beginCapture(token);
    captureRef.current = { token, pending };
    setFocused(true);
    pending.catch(() => {
      if (captureRef.current?.token === token) {
        inputRef.current?.blur();
        cancelCapture();
      }
    });
  }

  useEffect(() => {
    const deactivate = () => {
      // Electron window deactivation can leave the DOM input focused.
      inputRef.current?.blur();
      cancelCapture();
    };
    window.addEventListener('blur', deactivate);
    window.addEventListener('beforeunload', deactivate);
    return () => {
      window.removeEventListener('blur', deactivate);
      window.removeEventListener('beforeunload', deactivate);
      releaseCapture();
    };
  }, []);

  function commitCapture() {
    const capture = captureRef.current;
    if (!capture?.binding) return;
    const binding = capture.binding;
    capture.pending = capture.pending.then(() => p.onBind(binding));
    inputRef.current?.blur();
    cancelCapture();
  }

  function handlePress(event: React.KeyboardEvent<HTMLInputElement>) {
    const capture = captureRef.current;
    // We don't allow binding a modifier by itself.
    if (isModifierPress(event) || !capture) return;
    event.preventDefault();
    if (capture.binding) return;
    capture.binding = {
      key: event.code,
      modifiers: getModifiers(event),
    };
  }

  function handleRelease(event: React.KeyboardEvent<HTMLInputElement>) {
    // Keep shortcuts suspended until the captured key is released, so assigning
    // a shortcut cannot also execute it (including actions bound on keyup).
    if (captureRef.current?.binding?.key === event.code) commitCapture();
  }

  function handleClick(event: React.MouseEvent<HTMLInputElement>) {
    const key = event.button;
    const isPrimaryButton = key === 0 || key === 2;
    const capture = captureRef.current;
    if (!capture || isPrimaryButton) return;

    event.preventDefault();

    const code: Record<number, string> = {
      1: 'MiddleMouseButton',
      3: 'X1MouseButton',
      4: 'X2MouseButton',
    };

    if (!code[key] || capture.binding) return;
    capture.mouseButton = key;
    capture.binding = {
      key: code[key],
      modifiers: getModifiers(event),
    };
  }

  return (
    <Form layout="inline">
      <TextInput
        name="binding"
        style={{ width: 400, ...p.style }}
        label={<HotkeyLabel showLabel={p.showLabel ?? true} hotkey={p.hotkey} />}
        value={getHotkeyString(p.binding, focused)}
        onFocus={beginCapture}
        onBlur={cancelCapture}
        onKeyDown={handlePress}
        onKeyUp={handleRelease}
        onMouseDown={handleClick}
        onMouseUp={event => {
          if (captureRef.current?.mouseButton === event.button) commitCapture();
        }}
        inputRef={inputRef}
      />
    </Form>
  );
}

const HotkeyLabel = memo(function HotkeyLabel(p: { hotkey: IHotkey; showLabel: boolean }) {
  const { MarkersService, DualOutputService } = Services;

  const v = useVuex(() => ({
    dualOutputMode: DualOutputService.views.dualOutputMode,
    setMarkerName: MarkersService.actions.setMarkerName,
    getLabel: MarkersService.views.getLabel,
  }));

  const showDualOutputLabel = useMemo(() => {
    return p.hotkey.actionName !== 'SWITCH_TO_SCENE' && p.hotkey.sceneItemId !== undefined;
  }, [p.hotkey, v.dualOutputMode]);

  const handleLabel = useCallback(
    (value: string) => {
      v.setMarkerName(p.hotkey.actionName, value);
    },
    [p.hotkey.actionName, v.setMarkerName],
  );

  const label = useMemo(() => v.getLabel(p.hotkey.actionName), [p.hotkey.actionName, v.getLabel]);

  const icon = useMemo(
    () => (p.hotkey?.display === 'vertical' ? 'icon-phone-case' : 'icon-desktop'),
    [p.hotkey?.display],
  );

  return (
    <>
      {p.showLabel && (
        <>
          {showDualOutputLabel && <i className={icon} style={{ margin: '5px', opacity: 0.6 }} />}
          {p.hotkey.isMarker ? (
            <TextInput value={label} onChange={handleLabel} nowrap />
          ) : (
            p.hotkey.description || ''
          )}
        </>
      )}
    </>
  );
});
