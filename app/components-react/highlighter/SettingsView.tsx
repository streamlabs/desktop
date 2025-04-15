import React, { useEffect, useRef, useState } from 'react';
import { InfoCircleOutlined } from '@ant-design/icons';
import HotkeyBinding from 'components-react/shared/HotkeyBinding';
import { IHotkey } from 'services/hotkeys';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import { Button } from 'antd';
import { SUPPORTED_FILE_TYPES } from 'services/highlighter/constants';
import { SliderInput, SwitchInput } from 'components-react/shared/inputs';
import Form from 'components-react/shared/inputs/Form';
import Scrollable from 'components-react/shared/Scrollable';
import styles from './SettingsView.m.less';
import { $t } from 'services/i18n';
import { EHighlighterView, IViewState } from 'services/highlighter/models/highlighter.models';
import { EAvailableFeatures } from 'services/incremental-rollout';

export default function SettingsView({
  emitSetView,
  close,
}: {
  emitSetView: (data: IViewState) => void;
  close: () => void;
}) {
  const {
    HotkeysService,
    SettingsService,
    StreamingService,
    HighlighterService,
    IncrementalRolloutService,
  } = Services;
  const aiHighlighterFeatureEnabled = IncrementalRolloutService.views.featureIsEnabled(
    EAvailableFeatures.aiHighlighter,
  );
  const [hotkey, setHotkey] = useState<IHotkey | null>(null);
  const hotkeyRef = useRef<IHotkey | null>(null);

  const v = useVuex(() => ({
    settingsValues: SettingsService.views.values,
    isStreaming: StreamingService.isStreaming,
    useAiHighlighter: HighlighterService.views.useAiHighlighter,
    highlighterVersion: HighlighterService.views.highlighterVersion,
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

    // We will only set recording format to mp4 if the user isn't already on
    // a supported format. i.e. don't switch them from mov to mp4, but we will
    // switch from flv to mp4.
    if (!SUPPORTED_FILE_TYPES.includes(v.settingsValues.Output.RecFormat)) {
      SettingsService.actions.setSettingsPatch({ Output: { RecFormat: 'mp4' } });
    }
  }

  useEffect(() => {
    HotkeysService.actions.return.getGeneralHotkeyByName('SAVE_REPLAY').then(hotkey => {
      if (hotkey) setHotkey(hotkey);
    });
  }, []);

  useEffect(() => {
    if (!v.isStreaming) {
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
  }, [v.isStreaming]);

  function completedStepHeading(title: string) {
    return (
      <h3>
        {/* <CheckCircleOutlined style={{ color: 'var(--teal)', fontSize: 24, marginRight: 8 }} /> */}
        <span style={{ lineHeight: '24px', verticalAlign: 'top' }}>{title}</span>
      </h3>
    );
  }

  function incompleteStepHeading(title: string) {
    return (
      <h3>
        <InfoCircleOutlined style={{ color: 'var(--info)', fontSize: 24, marginRight: 8 }} />
        <span style={{ lineHeight: '24px', verticalAlign: 'top' }}>{title}</span>
      </h3>
    );
  }

  function setReplayTime(time: number) {
    SettingsService.actions.setSettingsPatch({ Output: { RecRBTime: time } });
  }

  function toggleUseAiHighlighter() {
    HighlighterService.actions.toggleAiHighlighter();
  }

  return (
    <div className={styles.settingsViewRoot}>
      <div style={{ display: 'flex', padding: 20 }}>
        <div style={{ flexGrow: 1 }}>
          <h1 style={{ margin: 0 }}>{$t('Highlighter')}</h1>
          <p>
            {$t(
              'The highlighter allows you to clip the best moments from your livestream and edit them together into an exciting highlight video you can upload directly to YouTube.',
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '16px' }}>
          {aiHighlighterFeatureEnabled && (
            <Button type="primary" onClick={() => emitSetView({ view: EHighlighterView.STREAM })}>
              {$t('Stream Highlights')}
            </Button>
          )}
          {/* New button coming with next PR */}
          <Button onClick={() => emitSetView({ view: EHighlighterView.CLIPS, id: undefined })}>
            {$t('All Clips')}
          </Button>
        </div>
      </div>

      <Scrollable style={{ flexGrow: 1, padding: '20px 20px 20px 20px', width: '100%' }}>
        <div className={styles.innerScrollWrapper}>
          <div className={styles.cardWrapper}>
            {aiHighlighterFeatureEnabled && (
              <div className={styles.highlighterCard}>
                <div className={styles.cardHeaderbarWrapper}>
                  <div className={styles.cardHeaderbar}>
                    <i style={{ margin: 0, fontSize: '20px' }} className="icon-highlighter"></i>
                    <h3 style={{ margin: 0, fontSize: '20px' }}> {$t('AI Highlighter')}</h3>
                    <p className={styles.headerbarTag}>{$t('For Fortnite streams (Beta)')}</p>
                  </div>
                </div>

                <p style={{ margin: 0 }}>
                  {$t(
                    'Automatically capture the best moments from your livestream and turn them into a highlight video.',
                  )}{' '}
                  {v.highlighterVersion !== '' && (
                    <span>
                      {$t(
                        'The AI Highlighter App can be managed in the Apps Manager tab or in Settings > Installed apps.',
                      )}
                    </span>
                  )}
                </p>

                {v.highlighterVersion !== '' ? (
                  <SwitchInput
                    style={{ margin: 0, marginLeft: '-10px' }}
                    size="default"
                    value={v.useAiHighlighter}
                    onChange={toggleUseAiHighlighter}
                  />
                ) : (
                  <Button
                    style={{ width: 'fit-content' }}
                    type="primary"
                    onClick={() => {
                      HighlighterService.actions.installAiHighlighter(true, 'Highlighter-tab');
                    }}
                  >
                    {$t('Install AI Highlighter App')}
                  </Button>
                )}
                <div className={styles.recommendedCorner}>{$t('Recommended')}</div>
              </div>
            )}
            <div className={styles.manualCard}>
              <h3 className={styles.cardHeaderTitle}>
                {aiHighlighterFeatureEnabled
                  ? $t('Or, use the built-in manual highlighter')
                  : $t('Built-in manual highlighter')}
              </h3>
              <p>
                {$t(
                  'Manually capture the best moments from your livestream with a hotkey command, and automatically turn them into a highlight video.',
                )}
              </p>
              <div style={{ display: 'flex', gap: '16px' }}>
                {!v.isStreaming && !correctlyConfigured && (
                  <div className={styles.settingSection}>
                    {correctlyConfigured
                      ? completedStepHeading($t('Configure the replay buffer'))
                      : incompleteStepHeading($t('Configure the replay buffer'))}
                    {correctlyConfigured ? (
                      <div>{$t('The replay buffer is correctly configured')}</div>
                    ) : (
                      <Button onClick={configure}>{$t('Configure')}</Button>
                    )}
                  </div>
                )}
                {v.isStreaming && (
                  <div className={styles.settingSection} style={{ width: '100%' }}>
                    <p>{$t('End your stream to change the Hotkey or the replay duration.')}</p>
                  </div>
                )}

                {!v.isStreaming && (
                  <div className={styles.settingSection}>
                    {hotkey?.bindings.length
                      ? completedStepHeading($t('Set a hotkey to capture replays'))
                      : incompleteStepHeading($t('Set a hotkey to capture replays'))}
                    {hotkey && (
                      <HotkeyBinding
                        style={{ width: 'calc(100% + 10px)', marginLeft: '-10px' }}
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
                    )}
                  </div>
                )}
                {!v.isStreaming && (
                  <div className={styles.settingSection} style={{ width: '100%' }}>
                    {completedStepHeading($t('Adjust replay duration'))}
                    <Form layout="inline">
                      <SliderInput
                        style={{ width: 'calc(100% + 14px)', marginLeft: '-10px' }}
                        // label={$t('Replay Duration')}
                        label={null}
                        value={v.settingsValues.Output.RecRBTime}
                        onChange={setReplayTime}
                        min={1}
                        max={120}
                        step={1}
                        debounce={200}
                        hasNumberInput={false}
                        tooltipPlacement="top"
                        tipFormatter={v => `${v}s`}
                      />
                    </Form>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className={styles.image}></div>
        </div>
      </Scrollable>
    </div>
  );
}
