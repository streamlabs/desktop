import React, { useRef, useMemo } from 'react';
import useBaseElement from './hooks';
import { Tooltip } from 'antd';
import { useVuex } from 'components-react/hooks';
import Scrollable from 'components-react/shared/Scrollable';
import GLVolmeters from './mixer/GLVolmeters';
import MixerItem from './mixer/MixerItem';
import { Services } from 'components-react/service-provider';
import { Menu } from 'util/menus/Menu';
import { $t } from 'services/i18n';
import { useRealmObject } from 'components-react/hooks/realm';

const mins = { x: 150, y: 120 };

export function Mixer() {
  const { EditorCommandsService, AudioService, CustomizationService } = Services;

  const containerRef = useRef<HTMLDivElement>(null);

  const { renderElement } = useBaseElement(<Element />, mins, containerRef.current);

  const needToRenderVolmeters: boolean = useMemo(() => {
    // render volmeters without hardware acceleration only if we don't have the webgl context
    const canvas = document.createElement('canvas');
    return !canvas.getContext('webgl');
  }, []);

  const performanceMode = useRealmObject(CustomizationService.state).performanceMode;
  const { audioSourceIds } = useVuex(() => ({
    audioSourceIds: AudioService.views.sourcesForCurrentScene
      .filter(source => !source.mixerHidden && source.isControlledViaObs)
      .map(source => source.sourceId),
  }));

  function showAdvancedSettings() {
    AudioService.actions.showAdvancedSettings();
  }

  function handleRightClick() {
    const menu = new Menu();
    menu.append({
      label: $t('Unhide All'),
      click: () => EditorCommandsService.actions.executeCommand('UnhideMixerSourcesCommand'),
    });
    menu.popup();
  }

  function Element() {
    return (
      <>
        <div className="studio-controls-top">
          <Tooltip
            title={$t('Monitor audio levels. If the bars are moving you are outputting audio.')}
            placement="bottom"
          >
            <h2 className="studio-controls__label">{$t('Mixer')}</h2>
          </Tooltip>
          <Tooltip title={$t('Open advanced audio settings')} placement="left">
            <i
              className="icon-settings icon-button"
              role="show-advanced-audio"
              onClick={showAdvancedSettings}
            />
          </Tooltip>
        </div>
        <Scrollable
          className="studio-controls-selector mixer-panel"
          style={{ height: 'calc(100% - 32px)' }}
        >
          <div style={{ position: 'relative' }} onContextMenu={handleRightClick}>
            {audioSourceIds.length !== 0 && !performanceMode && <GLVolmeters />}
            {audioSourceIds.map(sourceId => (
              <MixerItem
                key={sourceId}
                audioSourceId={sourceId}
                volmetersEnabled={needToRenderVolmeters}
              />
            ))}
          </div>
        </Scrollable>
      </>
    );
  }

  return (
    <div ref={containerRef} style={{ height: '100%' }}>
      {renderElement()}
    </div>
  );
}

Mixer.mins = mins;
