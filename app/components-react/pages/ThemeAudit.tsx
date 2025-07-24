import { Services } from 'components-react/service-provider';
import React, { useEffect, useState } from 'react';
import execa from 'execa';
import { FFPROBE_EXE } from 'services/highlighter/constants';
import { pmap } from 'util/pmap';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import Scrollable from 'components-react/shared/Scrollable';
import styles from './ThemeAudit.m.less';
import groupBy from 'lodash/groupBy';
import { Tabs, Modal } from 'antd';
import Display from 'components-react/shared/Display';
import { useVuex } from 'components-react/hooks';
import { useRealmObject } from 'components-react/hooks/realm';

class MediaFileReader {
  constructor(public readonly filePath: string) {}

  async readInfo() {
    const { stdout } = await execa(FFPROBE_EXE, [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height,r_frame_rate : format=duration',
      '-of',
      'json',
      this.filePath,
    ]);

    const result = JSON.parse(stdout);

    return {
      width: result.streams[0].width,
      height: result.streams[0].height,
      duration: result.format.duration,
      fps: result.streams[0].r_frame_rate,
    };
  }
}

interface IMediaSourceInfo {
  width: number;
  height: number;
  duration: number;
  fps: number;
  name: string;
  id: string;
  scene: string;
}

async function readMediaInfo(): Promise<IMediaSourceInfo[]> {
  const { ScenesService } = Services;

  const info = await pmap(
    ScenesService.views.getSceneItems().filter(s => s.type === 'ffmpeg_source'),
    async sceneItem => {
      const source = sceneItem.getSource();
      const reader = new MediaFileReader(source.getSettings().local_file);

      const info = await reader.readInfo();

      return {
        width: parseInt(info.width, 10),
        height: parseInt(info.height, 10),
        duration: parseFloat(info.duration),
        fps: parseInt(info.fps.split('/')[0], 10) / parseInt(info.fps.split('/')[1], 10),
        name: source.name,
        id: source.sourceId,
        scene: sceneItem.getScene().name,
      };
    },
  );

  return info;
}

type TWarningLevel = 'OK' | 'WARN' | 'CRITICAL';

export default function ThemeAudit() {
  const {
    SceneCollectionsService,
    ScenesService,
    SourcesService,
    TransitionsService,
    PerformanceService,
    SettingsService,
  } = Services;
  const [mediaInfo, setMediaInfo] = useState<IMediaSourceInfo[] | null>(null);
  const [inspectedSource, setInspectedSource] = useState<string | null>(null);
  const v = useVuex(() => ({
    cpu: PerformanceService.views.cpuPercent,
  }));
  useEffect(() => {
    readMediaInfo().then(info => setMediaInfo(info));
  }, []);

  // Force off media caching, as it skews results
  useEffect(() => {
    const currentValue = SettingsService.views.values.Advanced.fileCaching;
    SettingsService.actions.setSettingsPatch({ Advanced: { fileCaching: false } });

    return () => {
      SettingsService.actions.setSettingsPatch({ Advanced: { fileCaching: currentValue } });
    };
  }, []);

  const grouped = groupBy(mediaInfo ?? [], s => s.scene);

  const sources = SourcesService.views.sources;
  const sourceCount = sources.length;
  const hasWebcam = !!sources.find(s => s.type === 'dshow_input');
  const hasGameCapture = !!sources.find(s => s.type === 'game_capture');

  function renderStat(label: string, displayValue: string | number, type: TWarningLevel) {
    const color = {
      OK: 'inherit',
      WARN: 'var(--info)',
      CRITICAL: 'var(--red)',
    }[type];

    return (
      <span style={{ color, marginRight: 8 }}>
        {['WARN', 'CRITICAL'].includes(type) && <ExclamationCircleOutlined style={{ color }} />}{' '}
        <b>{label}:</b> {displayValue}
      </span>
    );
  }

  function renderNumericStat(
    label: string,
    displayValue: string | number,
    numericValue: number,
    thresholds: [number, number],
  ) {
    let type: TWarningLevel = 'OK';

    if (numericValue > thresholds[0]) type = 'WARN';
    if (numericValue > thresholds[1]) type = 'CRITICAL';

    return renderStat(label, displayValue, type);
  }

  function inspect(sourceId: string | null) {
    setInspectedSource(sourceId);
    if (sourceId) {
      TransitionsService.inspectSource(sourceId);
    } else {
      TransitionsService.cancelInspectSource();
    }
  }

  return (
    <div style={{ width: '100%', display: 'flex' }} className={styles.themeAuditRoot}>
      <Scrollable style={{ flexGrow: 1, padding: 20 }}>
        <h1>Theme Audit: {SceneCollectionsService.activeCollection?.name}</h1>

        <Tabs>
          <Tabs.TabPane tab="Overview" key="overview">
            <div className="section">
              <h2>Overall Stats</h2>
              <div>{renderNumericStat('Source Count', sourceCount, sourceCount, [49, 99])}</div>
              <div>
                {renderStat(
                  'Webcam',
                  hasWebcam ? 'Present' : 'Missing',
                  hasWebcam ? 'OK' : 'CRITICAL',
                )}
              </div>
              <div>
                {renderStat(
                  'Game Capture',
                  hasGameCapture ? 'Present' : 'Missing',
                  hasGameCapture ? 'OK' : 'CRITICAL',
                )}
              </div>
            </div>
          </Tabs.TabPane>
          <Tabs.TabPane tab="Media Sources" key="media">
            {mediaInfo && (
              <div>
                {ScenesService.views.scenes.map(scene => (
                  <div key={scene.name} className="section">
                    <h3>{scene.name}</h3>
                    <div>
                      {renderNumericStat(
                        'Media Source Count',
                        (grouped[scene.name] ?? []).length.toString(),
                        (grouped[scene.name] ?? []).length,
                        [2, 4],
                      )}
                    </div>
                    {(grouped[scene.name] ?? []).map(info => (
                      <div key={info.id} style={{ padding: '5px 0' }}>
                        <i className="fas fa-film" /> <b>{info.name}</b>
                        <button className="button button--trans" onClick={() => inspect(info.id)}>
                          Inspect
                        </button>
                        <br />
                        {renderNumericStat(
                          'Resolution',
                          `${info.width} x ${info.height}`,
                          info.width * info.height,
                          [1280 * 720 - 1, 1920 * 1080 - 1],
                        )}
                        {renderNumericStat('FPS', info.fps.toFixed(2), info.fps, [30, 59])}
                        {renderNumericStat('Duration', info.duration.toFixed(2), info.duration, [
                          10,
                          18,
                        ])}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
            {mediaInfo == null && <div>Loading...</div>}
          </Tabs.TabPane>
        </Tabs>
        <Modal
          visible={!!inspectedSource}
          destroyOnClose={true}
          closable={false}
          onCancel={() => inspect(null)}
          onOk={() => inspect(null)}
          width={780}
        >
          {inspectedSource && (
            <div>
              <div style={{ height: 400 }}>
                <Display sourceId={inspectedSource} />
              </div>
              <div style={{ fontSize: 48 }}>CPU: {v.cpu}%</div>
            </div>
          )}
        </Modal>
      </Scrollable>
    </div>
  );
}
