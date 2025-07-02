import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  EExportStep,
  TFPS,
  TResolution,
  TPreset,
  ISubtitleStyle,
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
import { initStore, useController } from '../../hooks/zustand';
import { EOrientation, TOrientation } from 'services/highlighter/models/ai-highlighter.models';
import { fileExists } from 'services/highlighter/file-utils';
import { SCRUB_HEIGHT, SCRUB_WIDTH, SCRUB_FRAMES } from 'services/highlighter/constants';
import styles from './ExportModal.m.less';
import { getCombinedClipsDuration } from '../utils';
import { formatSecondsToHMS } from '../ClipPreview';
import PlatformSelect from './Platform';
import cx from 'classnames';
import { SubtitleStyles } from 'services/highlighter/subtitles/subtitle-styles';
import Utils from 'services/utils';
import { isDeepEqual } from 'slap';
import { getVideoResolution } from 'services/highlighter/cut-highlight-clips';

type TSetting = { name: string; fps: TFPS; resolution: TResolution; preset: TPreset };

interface ISubtitleItem {
  name: string;
  enabled: boolean;
  style?: ISubtitleStyle;
}
const settings: TSetting[] = [
  { name: 'Standard', fps: 30, resolution: 1080, preset: 'medium' },
  { name: 'Best', fps: 60, resolution: 1080, preset: 'slow' },
  { name: 'Fast', fps: 30, resolution: 720, preset: 'fast' },
  { name: 'Custom', fps: 30, resolution: 720, preset: 'medium' },
];

const subtitleItems: ISubtitleItem[] = [
  {
    name: 'No subtitles',
    enabled: false,
    style: undefined,
  },
  {
    name: 'Basic',
    enabled: true,
    style: SubtitleStyles.basic,
  },
  {
    name: 'Thick',
    enabled: true,
    style: SubtitleStyles.thick,
  },
  {
    name: 'FlashyA',
    enabled: true,
    style: SubtitleStyles.flashyA,
  },
  {
    name: 'FlashyB',
    enabled: true,
    style: SubtitleStyles.yellow,
  },
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

  getDuration(streamId?: string) {
    return getCombinedClipsDuration(this.getClips(streamId));
  }

  async getClipResolution(streamId?: string) {
    const firstClipPath = this.getClips(streamId).find(clip => clip.enabled)?.path;
    if (!firstClipPath) {
      return undefined;
    }
    return await getVideoResolution(firstClipPath);
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

  setSubtitles(subtitleItem: ISubtitleItem) {
    this.service.actions.setSubtitleStyle(subtitleItem.style);
  }

  getSubtitleStyle() {
    return this.service.views.exportInfo.subtitleStyle;
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
  isHighlighterAfterVersion(version: string) {
    return this.service.isHighlighterVersionAfter(version);
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

  if (!exportInfo.exported || exportInfo.exporting || exportInfo.error) {
    return (
      <ExportFlow
        isExporting={exportInfo.exporting}
        isTranscribing={exportInfo.transcriptionInProgress}
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
  isTranscribing,
  streamId,
  videoName,
  onVideoNameChange,
}: {
  close: () => void;
  isExporting: boolean;
  isTranscribing: boolean;
  streamId: string | undefined;
  videoName: string;
  onVideoNameChange: (name: string) => void;
}) {
  const { UsageStatisticsService, HighlighterService } = Services;
  const {
    exportInfo,
    cancelExport,
    dismissError,
    setResolution,
    setFps,
    setPreset,
    setSubtitles,
    getSubtitleStyle,
    fileExists,
    setExport,
    exportCurrentFile,
    getStreamTitle,
    getClips,
    getDuration,
    isHighlighterAfterVersion,
    getClipResolution,
  } = useController(ExportModalCtx);

  const [currentFormat, setCurrentFormat] = useState<TOrientation>(EOrientation.HORIZONTAL);

  const { amount, duration, thumbnail } = useMemo(() => {
    const clips = getClips(streamId);

    return {
      amount: clips.length,
      duration: formatSecondsToHMS(getCombinedClipsDuration(clips)),
      thumbnail: clips.find(clip => clip.enabled)?.scrubSprite,
    };
  }, [streamId]);

  const showSubtitleSettings = useMemo(() => isHighlighterAfterVersion('0.0.53'), []);

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

  const [currentSubtitleItem, setSubtitleItem] = useState<ISubtitleItem>(
    findSubtitleItem(getSubtitleStyle()) || subtitleItems[0],
  );

  const [currentSetting, setSetting] = useState<TSetting | null>(null);
  const [isLoadingResolution, setIsLoadingResolution] = useState(true);

  async function initializeSettings() {
    try {
      const resolution = await getClipResolution(streamId);
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

  useEffect(() => {
    setIsLoadingResolution(true);
    initializeSettings();
  }, [streamId]);

  // Video name and export file are kept in sync
  const [exportFile, setExportFile] = useState<string>(getExportFileFromVideoName(videoName));

  function findSubtitleItem(subtitleStyle: ISubtitleStyle | null) {
    if (!subtitleStyle) return subtitleItems[0];

    for (const item of subtitleItems) {
      const isMatching = isDeepEqual(item.style, subtitleStyle, 0, 2);
      if (isMatching) return item;
    }
  }

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

    const streamInfo = HighlighterService.views.highlightedStreams.find(
      stream => stream.id === streamId,
    );

    if (streamInfo && !streamInfo.feedbackLeft) {
      streamInfo.feedbackLeft = true;
      HighlighterService.updateStream(streamInfo);

      const clips = getClips(streamId);

      UsageStatisticsService.recordAnalyticsEvent('AIHighlighter', {
        type: 'ThumbsUp',
        streamId: streamInfo?.id,
        game: streamInfo?.game,
        clips: clips?.length,
      });
    }
  }

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
              {isExporting &&
                (isTranscribing ? (
                  <div className={styles.progressItem}>
                    <div className={styles.loadingSpinner}>
                      <i className="fa fa-spinner fa-spin" style={{ fontSize: '24px' }} />
                    </div>
                    <p>
                      <span>{$t('Generating subtitles...')} </span>
                    </p>
                  </div>
                ) : (
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
                ))}
              {currentSubtitleItem?.style && (
                <div className={styles.subtitlePreview}>
                  <SubtitlePreview
                    svgStyle={currentSubtitleItem.style}
                    orientation={currentFormat}
                    inPreview={true}
                  />
                </div>
              )}
              <img
                src={thumbnail}
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
                  {duration} | {$t('%{clipsAmount} clips', { clipsAmount: amount })}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {showSubtitleSettings && (
                  <SubtitleDropdownWrapper
                    initialSetting={currentSubtitleItem}
                    disabled={isExporting}
                    emitSettings={setting => {
                      setSubtitleItem(setting);
                      setSubtitles(setting);
                    }}
                  />
                )}

                <OrientationToggle
                  initialState={currentFormat}
                  disabled={isExporting}
                  emitState={format => setCurrentFormat(format)}
                />
              </div>
            </div>
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

function SubtitleDropdownWrapper({
  initialSetting: initialItem,
  disabled,
  emitSettings,
}: {
  initialSetting: ISubtitleItem;
  disabled: boolean;
  emitSettings: (item: ISubtitleItem) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentSetting, setSetting] = useState<ISubtitleItem>(initialItem);

  return (
    <div style={{ width: '72px' }} className={`${disabled ? styles.isDisabled : ''}`}>
      <Dropdown
        overlay={
          <div className={styles.innerItemWrapper} style={{ width: 'fit-content' }}>
            {subtitleItems.map(item => {
              return (
                <div
                  className={`${styles.innerDropdownItem} ${
                    item.name === currentSetting.name ? styles.active : ''
                  }`}
                  style={{ display: 'flex', justifyContent: 'center' }}
                  onClick={() => {
                    setSetting(item);
                    emitSettings(item);
                    setIsOpen(false);
                  }}
                  key={item.name}
                >
                  {item.enabled === false ? (
                    <div className={styles.dropdownText}>{item.name}</div>
                  ) : (
                    item.style && <SubtitlePreview svgStyle={item.style} />
                  )}
                </div>
              );
            })}
          </div>
        }
        trigger={['click']}
        visible={isOpen}
        onVisibleChange={setIsOpen}
        placement="bottomCenter"
      >
        <div
          className={styles.innerDropdownWrapper}
          style={{ paddingLeft: '4px' }}
          onClick={() => setIsOpen(!isOpen)}
        >
          <div
            className={styles.dropdownText}
            style={{ opacity: currentSetting.enabled ? 1 : 0.3 }}
          >
            <SubtitleIcon />
          </div>
          <i className="icon-down" style={{ opacity: 0.7 }}></i>
        </div>
      </Dropdown>
    </div>
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
          <i className="icon-down" style={{ opacity: 0.7 }}></i>
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

function SubtitlePreview({
  svgStyle,
  inPreview,
  orientation,
}: {
  svgStyle: ISubtitleStyle;
  inPreview?: boolean;
  orientation?: TOrientation;
}) {
  const WIDTH = 250;
  const HEIGHT = 60;
  const formattedFontSize = orientation === 'horizontal' ? 22 : 14;
  const fontSize = inPreview ? formattedFontSize : 24;

  return (
    <div>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={WIDTH}
        height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      >
        {/* <rect width="100%" height="100%" fill="#FF5733" /> */}
        <text
          fontFamily={svgStyle.fontFamily}
          fontStyle={svgStyle.isItalic ? 'italic' : 'normal'}
          fontWeight={svgStyle.isBold ? 'bold' : 'normal'}
          fill={svgStyle.fontColor}
          fontSize={fontSize}
          textAnchor="middle"
          dominantBaseline="middle"
          paintOrder="stroke fill"
          strokeWidth={svgStyle.strokeWidth ?? 0}
          stroke={svgStyle.strokeColor || 'none'}
          strokeOpacity={svgStyle.strokeColor ? 1 : 0}
          x={WIDTH / 2}
          y={HEIGHT / 2}
        >
          Auto subtitles
        </text>
      </svg>
    </div>
  );
}

export const SubtitleIcon = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="7" y="7" width="18" height="18" rx="2" stroke="white" strokeWidth="2" />
    <g filter="url(#filter0_d_3248_34353)">
      <path d="M14 21H18" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </g>
    <g filter="url(#filter1_d_3248_34353)">
      <path d="M12 17H20" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </g>
    <defs>
      <filter
        id="filter0_d_3248_34353"
        x="9"
        y="20"
        width="14"
        height="10"
        filterUnits="userSpaceOnUse"
        colorInterpolationFilters="sRGB"
      >
        <feFlood floodOpacity="0" result="BackgroundImageFix" />
        <feColorMatrix
          in="SourceAlpha"
          type="matrix"
          values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
          result="hardAlpha"
        />
        <feOffset dy="4" />
        <feGaussianBlur stdDeviation="2" />
        <feComposite in2="hardAlpha" operator="out" />
        <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0" />
        <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_3248_34353" />
        <feBlend
          mode="normal"
          in="SourceGraphic"
          in2="effect1_dropShadow_3248_34353"
          result="shape"
        />
      </filter>
      <filter
        id="filter1_d_3248_34353"
        x="7"
        y="16"
        width="18"
        height="10"
        filterUnits="userSpaceOnUse"
        colorInterpolationFilters="sRGB"
      >
        <feFlood floodOpacity="0" result="BackgroundImageFix" />
        <feColorMatrix
          in="SourceAlpha"
          type="matrix"
          values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
          result="hardAlpha"
        />
        <feOffset dy="4" />
        <feGaussianBlur stdDeviation="2" />
        <feComposite in2="hardAlpha" operator="out" />
        <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0" />
        <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_3248_34353" />
        <feBlend
          mode="normal"
          in="SourceGraphic"
          in2="effect1_dropShadow_3248_34353"
          result="shape"
        />
      </filter>
    </defs>
  </svg>
);
