import React, { useEffect, useRef, useState } from 'react';
import { Button, InputNumber } from 'antd';
import HotkeyBinding from 'components-react/shared/HotkeyBinding';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import { IHotkey } from 'services/hotkeys';
import { SUPPORTED_FILE_TYPES } from 'services/highlighter/constants';
import { $t } from 'services/i18n';
import styles from './ManualCaptureSection.m.less';

const MIN_REPLAY_TIME = 1;
const MAX_REPLAY_TIME = 120;

/**
 * Replay buffer settings for capturing clips by hotkey. The captured clips show up in the clip
 * grid below this section.
 */
export default function ManualCaptureSection({ title }: { title: string }) {
  const { HotkeysService, SettingsService, StreamingService } = Services;
  const [hotkey, setHotkey] = useState<IHotkey | null>(null);
  const hotkeyRef = useRef<IHotkey | null>(null);
  const [bindingFocused, setBindingFocused] = useState(false);

  const v = useVuex(() => ({
    settingsValues: SettingsService.views.values,
    isStreaming: StreamingService.isStreaming,
  }));

  const correctlyConfigured =
    v.settingsValues.Output.RecRB &&
    v.settingsValues.General.ReplayBufferWhileStreaming &&
    !v.settingsValues.General.KeepReplayBufferStreamStops &&
    SUPPORTED_FILE_TYPES.includes(v.settingsValues.Output.RecFormat);

  function configure() {
    SettingsService.actions.setSettingsPatch({
      General: {
        ReplayBufferWhileStreaming: true,
        KeepReplayBufferStreamStops: false,
      },
      Output: {
        RecRB: true,
      },
    });

    // We will only re-queue if it's an unsupported file type. i.e. don't switch them from mov to
    // mp4, but we will switch from flv to mp4.
    if (!SUPPORTED_FILE_TYPES.includes(v.settingsValues.Output.RecFormat)) {
      SettingsService.actions.setSettingsPatch({ Output: { RecFormat: 'mp4' } });
    }
  }

  useEffect(() => {
    HotkeysService.actions.return.getGeneralHotkeyByName('SAVE_REPLAY').then(hotkey => {
      if (hotkey) setHotkey(hotkey);
    });
  }, []);

  // Hotkeys are unbound only while the binding input is focused, so pressing the current hotkey
  // records it instead of triggering it. This section lives on the main Highlighter page, so
  // all other hotkeys must keep working the rest of the time.
  useEffect(() => {
    if (bindingFocused && !v.isStreaming) {
      HotkeysService.actions.unregisterAll();

      return () => {
        if (hotkeyRef.current) {
          // Implies a bind all
          HotkeysService.actions.applyGeneralHotkey(hotkeyRef.current);
        } else {
          HotkeysService.actions.bindHotkeys();
        }
      };
    }
  }, [bindingFocused, v.isStreaming]);

  function setReplayTime(time: number | string | null | undefined) {
    if (typeof time !== 'number' || time < MIN_REPLAY_TIME || time > MAX_REPLAY_TIME) return;
    SettingsService.actions.setSettingsPatch({ Output: { RecRBTime: time } });
  }

  return (
    <section className={styles.manualCaptureSection}>
      <h3 className={styles.title}>{title}</h3>

      <div className={styles.settings}>
        {!v.isStreaming && !correctlyConfigured && (
          <Button type="primary" onClick={configure}>
            {$t('Configure replay buffer')}
          </Button>
        )}

        {v.isStreaming ? (
          <span className={styles.hint}>
            {$t('End your stream to change the Hotkey or the replay duration.')}
          </span>
        ) : (
          <>
            <div className={styles.setting}>
              <span>{$t('Set a hotkey to capture replaybuffer')}</span>
              {hotkey && (
                <div
                  onFocus={() => setBindingFocused(true)}
                  onBlur={() => setBindingFocused(false)}
                >
                  <HotkeyBinding
                    style={{ width: 160, margin: 0 }}
                    showLabel={false}
                    hotkey={hotkey}
                    binding={hotkey.bindings[0] ?? null}
                    onBind={binding => {
                      const newHotkey = { ...hotkey };
                      newHotkey.bindings.splice(0, 1, binding);
                      setHotkey(newHotkey);
                      hotkeyRef.current = newHotkey;
                    }}
                  />
                </div>
              )}
            </div>
            <div className={styles.setting}>
              <span>{$t('Adjust replay duration')}</span>
              <InputNumber
                value={v.settingsValues.Output.RecRBTime}
                onChange={setReplayTime}
                min={MIN_REPLAY_TIME}
                max={MAX_REPLAY_TIME}
                step={1}
                formatter={value => $t('%{seconds} seconds', { seconds: value })}
                parser={value => parseInt(value ?? '', 10)}
                style={{ width: 140 }}
              />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
