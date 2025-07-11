import { Form, Button, Alert } from 'antd';
import { useController } from 'components-react/hooks/zustand';
import { RadioInput } from 'components-react/shared/inputs';
import React, { useState, useEffect } from 'react';
import { $t } from 'services/i18n';
import {
  CustomDropdownWrapper,
  ExportModalCtx,
  settingMatcher,
  settings,
  TSetting,
} from './ExportModal';
import { Services } from 'components-react/service-provider';
import styles from './ExportModal.m.less';

export default function CollectionExport({
  close,
  clipCollectionIds,
}: {
  close: () => void;
  clipCollectionIds: string[];
}) {
  const { UsageStatisticsService, HighlighterService } = Services;
  const {
    exportInfo,
    cancelExport,
    dismissError,
    setResolution,
    setFps,
    setPreset,
    fileExists,
    setExport,
    exportCurrentFile,
    getStreamTitle,
    getClips,
    getDuration,
    getClipResolution,
  } = useController(ExportModalCtx);

  const [currentSetting, setSetting] = useState<TSetting | null>(null);
  const [isLoadingResolution, setIsLoadingResolution] = useState(true);

  const isExporting = false;

  async function initializeSettings() {
    try {
      const resolution = await getClipResolution(undefined, clipCollectionIds[0]);
      let setting: TSetting;
      if (resolution?.height === 720 && exportInfo.resolution !== 720) {
        setting = settings.find(s => s.resolution === 720) || settings[settings.length - 1];
      } else if (resolution?.height === 1080 && exportInfo.resolution !== 1080) {
        setting = settings.find(s => s.resolution === 1080) || settings[settings.length - 1];
      } else {
        setting = settingMatcher({
          name: 'from default',
          fps: exportInfo.fps,
          resolution: exportInfo.resolution,
          preset: exportInfo.preset,
        });
      }

      setSetting(setting);
      setFps(setting.fps.toString());
      setResolution(setting.resolution.toString());
      setPreset(setting.preset);
    } catch (error: unknown) {
      console.error('Failed to detect clip resolution, setting default. Error: ', error);
      setSetting(
        settingMatcher({
          name: 'from default',
          fps: exportInfo.fps,
          resolution: exportInfo.resolution,
          preset: exportInfo.preset,
        }),
      );
    } finally {
      setIsLoadingResolution(false);
    }
  }
  async function startExport() {
    clipCollectionIds.forEach(async clipCollectionId => {
      HighlighterService.actions.queueExportClipCollection(clipCollectionId);
    });
    close();
  }
  useEffect(() => {
    setIsLoadingResolution(true);
    initializeSettings();
  }, [clipCollectionIds]);

  return (
    <Form>
      <div className={styles.exportWrapper}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <h2 style={{ fontWeight: 600, margin: 0 }}>{$t('Export')}</h2>{' '}
          <div>
            <Button type="text" onClick={close}>
              <i className="icon-close" style={{ margin: 0 }}></i>
            </Button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '16px' }}>
          <div className={styles.settingsAndProgress}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              {isLoadingResolution ? (
                <div className={styles.innerDropdownWrapper}>
                  <div className={styles.dropdownText}>Loading settings...</div>
                  <i className="icon-down"></i>
                </div>
              ) : (
                <CustomDropdownWrapper
                  initialSetting={currentSetting!}
                  disabled={isExporting || isLoadingResolution}
                  emitSettings={setting => {
                    setSetting(setting);
                    if (setting.name !== 'Custom') {
                      setFps(setting.fps.toString());
                      setResolution(setting.resolution.toString());
                      setPreset(setting.preset);
                    }
                  }}
                />
              )}
            </div>
            {currentSetting?.name === 'Custom' && (
              <div className={`${styles.customSection} ${isExporting ? styles.isDisabled : ''}`}>
                <div className={styles.customItemWrapper}>
                  <p>{$t('Resolution')}</p>
                  <RadioInput
                    label={$t('Resolution')}
                    value={exportInfo.resolution.toString()}
                    options={[
                      { value: '720', label: '720p' },
                      { value: '1080', label: '1080p' },
                    ]}
                    onChange={setResolution}
                    buttons={true}
                  />
                </div>

                <div className={styles.customItemWrapper}>
                  <p>{$t('Frame Rate')}</p>
                  <RadioInput
                    label={$t('Frame Rate')}
                    value={exportInfo.fps.toString()}
                    options={[
                      { value: '30', label: '30 FPS' },
                      { value: '60', label: '60 FPS' },
                    ]}
                    onChange={setFps}
                    buttons={true}
                  />
                </div>

                <div className={styles.customItemWrapper}>
                  <p>{$t('File Size')}</p>
                  <RadioInput
                    label={$t('File Size')}
                    value={exportInfo.preset}
                    options={[
                      { value: 'fast', label: $t('Faster Export') },
                      { value: 'medium', label: $t('Balanced') },
                      { value: 'slow', label: $t('Smaller File') },
                    ]}
                    onChange={setPreset}
                    buttons={true}
                  />
                </div>
              </div>
            )}
            {exportInfo.error && (
              <Alert
                message={exportInfo.error}
                type="error"
                closable
                showIcon
                afterClose={dismissError}
              />
            )}
            <div style={{ textAlign: 'right' }}>
              {isExporting ? (
                <button
                  className="button button--soft-warning"
                  onClick={cancelExport}
                  style={{ width: '100%' }}
                  disabled={exportInfo.cancelRequested}
                >
                  {$t('Cancel')}
                </button>
              ) : (
                <Button type="primary" style={{ width: '100%' }} onClick={() => startExport()}>
                  export
                </Button>
              )}
            </div>
          </div>{' '}
        </div>
      </div>
    </Form>
  );
}
