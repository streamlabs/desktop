import React from 'react';
import cx from 'classnames';
import { SliderInput } from 'components-react/shared/inputs';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import { EditMenu } from 'util/menus/EditMenu';
import MixerVolmeter from './CanvasVolmeter';
import styles from './MixerItem.m.less';
import { useRealmObject } from 'components-react/hooks/realm';

export default function MixerItem(p: { audioSourceId: string; volmetersEnabled?: boolean }) {
  const volmetersEnabled = p.volmetersEnabled ?? true;

  const { CustomizationService, EditorCommandsService, SourcesService, AudioService } = Services;

  const performanceMode = useRealmObject(CustomizationService.state).performanceMode;

  const { sourceName, muted, deflection, db } = useVuex(() => ({
    performanceMode: CustomizationService.state.performanceMode,
    sourceName: SourcesService.state.sources[p.audioSourceId]?.name,
    muted: AudioService.views.getSource(p.audioSourceId)?.muted,
    deflection: AudioService.views.getSource(p.audioSourceId)?.fader.deflection,
    db: AudioService.views.getSource(p.audioSourceId)?.fader.db,
  }));

  function setMuted() {
    EditorCommandsService.actions.executeCommand('MuteSourceCommand', p.audioSourceId, !muted);
  }

  function onSliderChangeHandler(newVal: number) {
    EditorCommandsService.actions.executeCommand('SetDeflectionCommand', p.audioSourceId, newVal);
  }

  function showSourceMenu(sourceId: string) {
    const menu = new EditMenu({
      selectedSourceId: sourceId,
      showAudioMixerMenu: true,
    });
    menu.popup();
  }

  return (
    <>
      {AudioService.views.getSource(p.audioSourceId) ? (
        <div className={cx(styles.mixerItem, { [styles.muted]: muted })}>
          <div className="flex">
            <div className={styles.sourceName}>{sourceName}</div>
            <div className={styles.dbValue}>
              {deflection === 0 && <div>-Inf dB</div>}
              {deflection !== 0 && <div>{db.toFixed(1)} dB</div>}
            </div>
          </div>

          {!performanceMode && (
            <MixerVolmeter audioSourceId={p.audioSourceId} volmetersEnabled={volmetersEnabled} />
          )}

          <div className="flex">
            <div style={{ width: '100%', marginTop: '8px', marginBottom: '8px' }}>
              <SliderInput
                value={deflection}
                onChange={onSliderChangeHandler}
                min={0}
                max={1}
                step={0.01}
                throttle={100}
                nowrap
              />
            </div>
            <div className={styles.controls}>
              <i
                className={cx('icon-button', muted ? 'icon-mute' : 'icon-audio')}
                title={muted ? 'click to switch on' : 'click to switch off'}
                onClick={setMuted}
              />
              <i
                className="icon-button icon-settings"
                onClick={() => showSourceMenu(p.audioSourceId)}
              />
            </div>
          </div>
        </div>
      ) : (
        <div></div>
      )}
    </>
  );
}
