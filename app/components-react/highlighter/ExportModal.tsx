import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  EExportStep,
  TFPS,
  TResolution,
  TPreset,
} from 'services/highlighter/models/rendering.models';
import { Services } from 'components-react/service-provider';
import { FileInput, TextInput, ListInput } from 'components-react/shared/inputs';
import Form from 'components-react/shared/inputs/Form';
import path from 'path';
import { Button, Progress, Alert, Dropdown } from 'antd';
import YoutubeUpload from './YoutubeUpload';
import { RadioInput } from 'components-react/shared/inputs/RadioInput';
import { confirmAsync } from 'components-react/modals';
import { $t } from 'services/i18n';
import StorageUpload from './StorageUpload';
import { useVuex } from 'components-react/hooks';
import { initStore, useController } from '../hooks/zustand';
import { EOrientation, TOrientation } from 'services/highlighter/models/ai-highlighter.models';
import { fileExists } from 'services/highlighter/file-utils';
import { SCRUB_HEIGHT, SCRUB_WIDTH, SCRUB_FRAMES } from 'services/highlighter/constants';
import styles from './ExportModal.m.less';
import { getCombinedClipsDuration } from './utils';
import { formatSecondsToHMS } from './ClipPreview';
import cx from 'classnames';

type TSetting = { name: string; fps: TFPS; resolution: TResolution; preset: TPreset };
const settings: TSetting[] = [
  { name: 'Standard', fps: 30, resolution: 1080, preset: 'fast' },
  { name: 'Best', fps: 60, resolution: 1080, preset: 'slow' },
  { name: 'Custom', fps: 30, resolution: 720, preset: 'ultrafast' },
];
class ExportController {
  get service() {
    return Services.HighlighterService;
  }

  store = initStore({ videoName: 'My Video' });

  get exportInfo() {
    return this.service.views.exportInfo;
  }
  getStreamTitle(streamId?: string) {
    return (
      this.service.views.highlightedStreams.find(stream => stream.id === streamId)?.title ||
      'My Video'
    );
  }

  getClips(streamId?: string) {
    return this.service.getClips(this.service.views.clips, streamId).filter(clip => clip.enabled);
  }
  getClipThumbnail(streamId?: string) {
    return this.getClips(streamId).find(clip => clip.enabled)?.scrubSprite;
  }
  getDuration(streamId?: string) {
    return getCombinedClipsDuration(this.getClips(streamId));
  }

  dismissError() {
    return this.service.actions.dismissError();
  }
  resetExportedState() {
    return this.service.actions.resetExportedState();
  }

  setResolution(value: string) {
    this.service.actions.setResolution(parseInt(value, 10) as TResolution);
  }

  setFps(value: string) {
    this.service.actions.setFps(parseInt(value, 10) as TFPS);
  }

  setPreset(value: string) {
    this.service.actions.setPreset(value as TPreset);
  }

  setExport(exportFile: string) {
    this.service.actions.setExportFile(exportFile);
  }

  exportCurrentFile(
    streamId: string | undefined,
    orientation: TOrientation = EOrientation.HORIZONTAL,
  ) {
    this.service.actions.export(false, streamId, orientation);
  }

  cancelExport() {
    this.service.actions.cancelExport();
  }

  async clearUpload() {
    await this.service.actions.return.clearUpload();
  }

  async fileExists(exportFile: string) {
    return await fileExists(exportFile);
  }
}

export const ExportModalCtx = React.createContext<ExportController | null>(null);

export default function ExportModalProvider({
  close,
  streamId,
}: {
  close: () => void;
  streamId: string | undefined;
}) {
  const controller = useMemo(() => new ExportController(), []);
  return (
    <ExportModalCtx.Provider value={controller}>
      <ExportModal close={close} streamId={streamId} />
    </ExportModalCtx.Provider>
  );
}

function ExportModal({ close, streamId }: { close: () => void; streamId: string | undefined }) {
  const { exportInfo, dismissError, resetExportedState, getStreamTitle } = useController(
    ExportModalCtx,
  );

  const [videoName, setVideoName] = useState<string>(getStreamTitle(streamId) + ' - highlights');

  const unmount = () => {
    dismissError();
    resetExportedState();
  };
  // Clear all errors when this component unmounts
  useEffect(() => unmount, []);

  if (!exportInfo.exported || exportInfo.exporting) {
    return (
      <ExportFlow
        isExporting={exportInfo.exporting}
        close={close}
        streamId={streamId}
        videoName={videoName}
        onVideoNameChange={setVideoName}
      />
    );
  }
  return <PlatformSelect onClose={close} videoName={videoName} streamId={streamId} />;
}

function ExportFlow({
  close,
  isExporting,
  streamId,
  videoName,
  onVideoNameChange,
}: {
  close: () => void;
  isExporting: boolean;
  streamId: string | undefined;
  videoName: string;
  onVideoNameChange: (name: string) => void;
}) {
  const { UsageStatisticsService } = Services;
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
    getClipThumbnail,
  } = useController(ExportModalCtx);

  const [currentFormat, setCurrentFormat] = useState<TOrientation>(EOrientation.HORIZONTAL);

  const clipsAmount = getClips(streamId).length;
  const clipsDuration = formatSecondsToHMS(getDuration(streamId));

  function settingMatcher(initialSetting: TSetting) {
    const matchingSetting = settings.find(
      setting =>
        setting.fps === initialSetting.fps &&
        setting.resolution === initialSetting.resolution &&
        setting.preset === initialSetting.preset,
    );
    if (matchingSetting) {
      return matchingSetting;
    }
    return {
      name: 'Custom',
      fps: initialSetting.fps,
      resolution: initialSetting.resolution,
      preset: initialSetting.preset,
    };
  }

  const [currentSetting, setSetting] = useState<TSetting>(
    settingMatcher({
      name: 'from default',
      fps: exportInfo.fps,
      resolution: exportInfo.resolution,
      preset: exportInfo.preset,
    }),
  );

  // Video name and export file are kept in sync
  const [exportFile, setExportFile] = useState<string>(getExportFileFromVideoName(videoName));

  function getExportFileFromVideoName(videoName: string) {
    const parsed = path.parse(exportInfo.file);
    const sanitized = videoName.replace(/[/\\?%*:|"<>\.,;=#]/g, '');
    return path.join(parsed.dir, `${sanitized}${parsed.ext}`);
  }

  function getVideoNameFromExportFile(exportFile: string) {
    return path.parse(exportFile).name;
  }

  async function startExport(orientation: TOrientation) {
    if (await fileExists(exportFile)) {
      if (
        !(await confirmAsync({
          title: $t('Overwite File?'),
          content: $t('%{filename} already exists. Would you like to overwrite it?', {
            filename: path.basename(exportFile),
          }),
          okText: $t('Overwrite'),
        }))
      ) {
        return;
      }
    }

    UsageStatisticsService.actions.recordFeatureUsage('HighlighterExport');

    setExport(exportFile);
    exportCurrentFile(streamId, orientation);
  }

  return (
    <Form>
      <div className={styles.modalWrapper}>
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
            <div className={cx(styles.pathWrapper, isExporting && styles.isDisabled)}>
              <h2 style={{ margin: '0px' }}>
                <input
                  id="videoName"
                  type="text"
                  className={styles.customInput}
                  value={videoName}
                  onChange={e => {
                    const name = e.target.value;
                    onVideoNameChange(name);
                    setExportFile(getExportFileFromVideoName(name));
                  }}
                />
              </h2>
              <FileInput
                label={$t('Export Location')}
                name="exportLocation"
                save
                filters={[{ name: $t('MP4 Video File'), extensions: ['mp4'] }]}
                value={exportFile}
                onChange={file => {
                  setExportFile(file);
                  onVideoNameChange(getVideoNameFromExportFile(file));
                }}
                buttonContent={<i className="icon-edit" />}
              />
            </div>

            <div
              className={cx(styles.thumbnail, isExporting && styles.thumbnailInProgress)}
              style={
                currentFormat === EOrientation.HORIZONTAL
                  ? { aspectRatio: '16/9' }
                  : { aspectRatio: '9/16' }
              }
            >
              {isExporting && (
                <div className={styles.progressItem}>
                  <h1>
                    {Math.round((exportInfo.currentFrame / exportInfo.totalFrames) * 100) || 0}%
                  </h1>
                  <p>
                    {exportInfo.cancelRequested ? (
                      <span>{$t('Canceling...')}</span>
                    ) : (
                      <span>{$t('Exporting video...')}</span>
                    )}
                  </p>
                  <Progress
                    style={{ width: '100%' }}
                    percent={Math.round((exportInfo.currentFrame / exportInfo.totalFrames) * 100)}
                    trailColor="var(--section)"
                    status={exportInfo.cancelRequested ? 'exception' : 'normal'}
                    showInfo={false}
                  />
                </div>
              )}
              <img
                src={getClipThumbnail(streamId)}
                style={
                  currentFormat === EOrientation.HORIZONTAL
                    ? { objectPosition: 'left' }
                    : { objectPosition: `-${(SCRUB_WIDTH * 1.32) / 3 + 4}px` }
                }
              />
            </div>

            <div className={styles.clipInfoWrapper}>
              <div
                className={cx(isExporting && styles.isDisabled)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <p
                  style={{
                    margin: 0,
                    marginLeft: '8px',
                  }}
                >
                  {clipsDuration} | {$t('%{clipsAmount} clips', { clipsAmount })}
                </p>
              </div>
              <OrientationToggle
                initialState={currentFormat}
                disabled={isExporting}
                emitState={format => setCurrentFormat(format)}
              />
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <CustomDropdownWrapper
                initialSetting={currentSetting}
                disabled={isExporting}
                emitSettings={setting => {
                  setSetting(setting);
                  if (setting.name !== 'Custom') {
                    setFps(setting.fps.toString());
                    setResolution(setting.resolution.toString());
                    setPreset(setting.preset);
                  }
                }}
              />
            </div>
            {currentSetting.name === 'Custom' && (
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
                      { value: 'ultrafast', label: $t('Faster Export') },
                      { value: 'fast', label: $t('Balanced') },
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
                style={{ marginBottom: 24 }}
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
                <Button
                  type="primary"
                  style={{ width: '100%' }}
                  onClick={() => startExport(currentFormat)}
                >
                  {currentFormat === EOrientation.HORIZONTAL
                    ? $t('Export Horizontal')
                    : $t('Export Vertical')}
                </Button>
              )}
            </div>
          </div>{' '}
        </div>
      </div>
    </Form>
  );
}

function PlatformSelect({
  onClose,
  videoName,
  streamId,
}: {
  onClose: () => void;
  videoName: string;
  streamId: string | undefined;
}) {
  const { store, clearUpload, getStreamTitle } = useController(ExportModalCtx);
  const { UserService } = Services;
  const { isYoutubeLinked } = useVuex(() => ({
    isYoutubeLinked: !!UserService.state.auth?.platforms.youtube,
  }));
  const [platform, setPlatform] = useState(() => (isYoutubeLinked ? 'youtube' : 'crossclip'));

  async function handlePlatformSelect(val: string) {
    if (platform === 'youtube') await clearUpload();
    setPlatform(val);
  }

  const platformOptions = [
    { label: 'YouTube', value: 'youtube' },
    { label: 'Cross Clip', value: 'crossclip' },
    { label: 'Podcast Editor', value: 'typestudio' },
    { label: 'Video Editor', value: 'videoeditor' },
  ];

  return (
    <Form>
      <h1 style={{ display: 'inline', marginRight: '16px', position: 'relative', top: '3px' }}>
        {$t('Upload To')}
      </h1>
      <ListInput
        value={platform}
        onChange={handlePlatformSelect}
        nowrap
        options={platformOptions}
      />
      {platform === 'youtube' && (
        <YoutubeUpload defaultTitle={videoName} close={onClose} streamId={streamId} />
      )}
      {platform !== 'youtube' && <StorageUpload onClose={onClose} platform={platform} />}
    </Form>
  );
}

function CustomDropdownWrapper({
  initialSetting,
  disabled,
  emitSettings,
}: {
  initialSetting: TSetting;
  disabled: boolean;
  emitSettings: (settings: TSetting) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentSetting, setSetting] = useState<TSetting>(initialSetting);

  return (
    <div style={{ width: '100%' }} className={`${disabled ? styles.isDisabled : ''}`}>
      <Dropdown
        overlay={
          <div className={styles.innerItemWrapper}>
            {settings.map(setting => {
              return (
                <div
                  className={`${styles.innerDropdownItem} ${
                    setting.name === currentSetting.name ? styles.active : ''
                  }`}
                  onClick={() => {
                    setSetting(setting);
                    emitSettings(setting);
                    setIsOpen(false);
                  }}
                  key={setting.name}
                >
                  <div className={styles.dropdownText}>
                    {setting.name}{' '}
                    {setting.name !== 'Custom' && (
                      <>
                        <p>{setting.fps}fps</p> <p>{setting.resolution}p</p>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        }
        trigger={['click']}
        visible={isOpen}
        onVisibleChange={setIsOpen}
        placement="bottomLeft"
      >
        <div className={styles.innerDropdownWrapper} onClick={() => setIsOpen(!isOpen)}>
          <div className={styles.dropdownText}>
            {currentSetting.name}{' '}
            {currentSetting.name !== 'Custom' && (
              <>
                <p>{currentSetting.fps}fps</p> <p>{currentSetting.resolution}p</p>
              </>
            )}
          </div>
          <i className="icon-down"></i>
        </div>
      </Dropdown>
    </div>
  );
}

function OrientationToggle({
  initialState,
  disabled,
  emitState,
}: {
  initialState: TOrientation;
  disabled: boolean;
  emitState: (state: TOrientation) => void;
}) {
  const [currentFormat, setCurrentFormat] = useState(initialState);

  function setFormat(format: TOrientation) {
    setCurrentFormat(format);
    emitState(format);
  }
  return (
    <div className={`${styles.orientationToggle} ${disabled ? styles.isDisabled : ''}`}>
      <div
        className={`${styles.orientationButton} ${
          currentFormat === EOrientation.VERTICAL ? styles.active : ''
        }`}
        onClick={() => setFormat(EOrientation.VERTICAL)}
      >
        <div className={styles.verticalIcon}></div>
      </div>
      <div
        className={`${styles.orientationButton} ${
          currentFormat === EOrientation.HORIZONTAL ? styles.active : ''
        }`}
        onClick={() => setFormat(EOrientation.HORIZONTAL)}
      >
        <div className={styles.horizontalIcon}></div>
      </div>
    </div>
  );
}
