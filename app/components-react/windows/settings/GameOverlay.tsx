import { message } from 'antd';
import { useVuex } from 'components-react/hooks';
import { Services } from 'components-react/service-provider';
import { SliderInput, SwitchInput } from 'components-react/shared/inputs';
import React, { useState } from 'react';
import { $t } from 'services/i18n/index';

export function GameOverlay() {
  const { GameOverlayService } = Services;

  const { opacity, enabled, previewMode, windowProperties } = useVuex(() => ({
    opacity: GameOverlayService.state.opacity,
    enabled: GameOverlayService.state.isEnabled,
    previewMode: GameOverlayService.state.previewMode,
    windowProperties: GameOverlayService.state.windowProperties,
  }));

  const [enabling, setEnabling] = useState(false);

  async function enableGameOverlay(val: boolean) {
    setEnabling(true);
    try {
      await GameOverlayService.actions.return.setEnabled(val);
    } catch (e: unknown) {
      message.error($t('Please log in to use the in-game overlay.'), 3);
    }
    setEnabling(false);
  }

  function togglePreviewMode() {
    GameOverlayService.actions.setPreviewMode(!previewMode);
  }

  function setOpacity(value: number) {
    GameOverlayService.actions.setOverlayOpacity(value);
  }

  function resetPosition() {
    GameOverlayService.actions.resetPosition();
  }

  const sliderMetadata = {
    label: $t('Overlay Opacity'),
    min: 0,
    max: 100,
    step: 10,
    tipFormatter: (val: number) => `${val}%`,
    debounce: 500,
  };

  function WindowEnableToggles() {
    const titles = { chat: $t('Show Chat'), recentEvents: $t('Show Recent Events') };
    const windows = Object.keys(windowProperties);
    return (
      <div>
        {windows.map(win => (
          <React.Fragment key={titles[win]}>
            <SwitchInput
              label={titles[win]}
              value={windowProperties[win].enabled}
              onInput={() => GameOverlayService.actions.toggleWindowEnabled(win)}
            />
          </React.Fragment>
        ))}
      </div>
    );
  }

  function ExtraOptions() {
    return (
      <div>
        <SwitchInput
          value={previewMode}
          onInput={togglePreviewMode}
          label={$t('Toggle positioning mode')}
        />
        <SliderInput value={opacity} onChange={setOpacity} {...sliderMetadata} />
        <button
          className="button button--action"
          onClick={resetPosition}
          style={{ marginBottom: '16px' }}
        >
          {$t('Reset Overlay Position')}
        </button>
      </div>
    );
  }

  return (
    <div className="section">
      {!enabling && (
        <div className="section-content">
          <SwitchInput
            value={enabled}
            onInput={enableGameOverlay}
            label={$t('Enable in-game overlay')}
          />
          {enabled && <WindowEnableToggles />}
          {enabled && <ExtraOptions />}
          <div style={{ marginBottom: '16px' }}>
            {$t('Set a hotkey in Hotkey Settings to toggle the in-game overlay')}
          </div>
          <div style={{ marginBottom: '16px' }}>
            {$t(
              'The in-game overlay is a new experimental feature that allows you to view chat and events ' +
                'overlayed on top of your game.  This overlay may not work with certain games running in exclusive ' +
                'fullscreen mode.  For best results, we recommend running your game in windowed-fullscreen mode.',
            )}
          </div>
        </div>
      )}
    </div>
  );
}

GameOverlay.page = 'Game Overlay';
