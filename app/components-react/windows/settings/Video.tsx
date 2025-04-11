import * as remote from '@electron/remote';
import React, { useEffect, useMemo, useState } from 'react';
import { Services } from '../../service-provider';
import { message } from 'antd';
import FormFactory, { TInputValue } from 'components-react/shared/inputs/FormFactory';
import { EScaleType, EFPSType, IVideoInfo } from '../../../../obs-api';
import { $t } from 'services/i18n';
import styles from './Common.m.less';
import Tabs from 'components-react/shared/Tabs';
import { invalidFps, IVideoInfoValue, TDisplayType } from 'services/video';
import { AuthModal } from 'components-react/shared/AuthModal';
import Utils from 'services/utils';
import DualOutputToggle from '../../shared/DualOutputToggle';
import { ObsSettingsSection } from './ObsSettings';
import { useRealmObject } from 'components-react/hooks/realm';
import uniq from 'lodash/uniq';

const CANVAS_RES_OPTIONS = [
  { label: '1920x1080', value: '1920x1080' },
  { label: '1280x720', value: '1280x720' },
];

const VERTICAL_CANVAS_OPTIONS = [
  { label: '720x1280', value: '720x1280' },
  { label: '1080x1920', value: '1080x1920' },
];

const OUTPUT_RES_OPTIONS = [
  { label: '1920x1080', value: '1920x1080' },
  { label: '1536x864', value: '1536x864' },
  { label: '1440x810', value: '1440x810' },
  { label: '1280x720', value: '1280x720' },
  { label: '1152x648', value: '1152x648' },
  { label: '1096x616', value: '1096x616' },
  { label: '960x540', value: '960x540' },
  { label: '852x480', value: '852x480' },
  { label: '768x432', value: '768x432' },
  { label: '698x392', value: '698x392' },
  { label: '640x360', value: '640x360' },
];

const VERTICAL_OUTPUT_RES_OPTIONS = [
  { label: '720x1280', value: '720x1280' },
  { label: '1080x1920', value: '1080x1920' },
];

const FPS_OPTIONS = [
  { label: '10', value: '10-1' },
  { label: '20', value: '20-1' },
  { label: '24 NTSC', value: '24000-1001' },
  { label: '25', value: '25-1' },
  { label: '29.97', value: '30000-1001' },
  { label: '30', value: '30-1' },
  { label: '48', value: '48-1' },
  { label: '59.94', value: '60000-1001' },
  { label: '60', value: '60-1' },
];

export function VideoSettings() {
  const {
    DualOutputService,
    StreamingService,
    WindowsService,
    TransitionsService,
    UserService,
    UsageStatisticsService,
    OnboardingService,
    SettingsService,
    TikTokService,
    VideoService,
  } = Services;

  const videoSettings = useRealmObject(Services.VideoService.state);
  const dualOutputMode = DualOutputService.views.dualOutputMode;
  const cantEditFields = StreamingService.views.isStreaming || StreamingService.views.isRecording;

  const [display, setDisplay] = useState<TDisplayType>('horizontal');
  const [showModal, setShowModal] = useState(false);
  const [baseRes, setBaseRes] = useState(videoSettings[display].baseRes);
  const [customBaseRes, setCustomBaseRes] = useState(videoSettings[display].baseRes);
  const [outputRes, setOutputRes] = useState(videoSettings[display].outputRes);
  const [customOutputRes, setCustomOutputRes] = useState(videoSettings[display].outputRes);
  const [fpsType, setFPSType] = useState(videoSettings[display].values.fpsType);

  useEffect(() => {
    const baseRes = !baseResOptions.find(opt => opt.value === videoSettings[display].baseRes)
      ? 'custom'
      : videoSettings[display].baseRes;
    const outputRes = !outputResOptions.find(opt => opt.value === videoSettings[display].outputRes)
      ? 'custom'
      : videoSettings[display].outputRes;
    setBaseRes(baseRes);
    setCustomBaseRes(videoSettings[display].baseRes);
    setOutputRes(outputRes);
    setCustomOutputRes(videoSettings[display].outputRes);
    setFPSType(videoSettings[display].values.fpsType);
  }, [display]);

  const values: Dictionary<TInputValue> = {
    ...videoSettings[display].values,
    baseRes,
    outputRes,
    customBaseRes,
    customOutputRes,
    fpsType,
  };

  const resolutionValidator = {
    message: $t('The resolution must be in the format [width]x[height] (i.e. 1920x1080)'),
    pattern: /^[0-9]+x[0-9]+$/,
  };

  const monitorResolutions = useMemo(() => {
    const resOptions: { label: string; value: string }[] = [];
    const displays = remote.screen.getAllDisplays();
    displays.forEach((monitor: Electron.Display) => {
      const size = monitor.size;
      const res = `${size.width}x${size.height}`;
      if (
        !resOptions.find(opt => opt.value === res) &&
        !CANVAS_RES_OPTIONS.find(opt => opt.value === res)
      ) {
        resOptions.push({ label: res, value: res });
      }
    });
    return resOptions;
  }, []);

  const baseResOptions = useMemo(() => {
    const options =
      display === 'vertical'
        ? VERTICAL_CANVAS_OPTIONS
        : CANVAS_RES_OPTIONS.concat(monitorResolutions)
            .concat(VERTICAL_CANVAS_OPTIONS)
            .concat([{ label: $t('Custom'), value: 'custom' }]);

    return uniq(options);
  }, [display, monitorResolutions]);

  const outputResOptions = useMemo(() => {
    const baseRes = `${videoSettings.horizontal.baseWidth}x${videoSettings.horizontal.baseHeight}`;

    const options =
      display === 'vertical'
        ? VERTICAL_OUTPUT_RES_OPTIONS
        : [{ label: baseRes, value: baseRes }]
            .concat(OUTPUT_RES_OPTIONS)
            .concat(VERTICAL_OUTPUT_RES_OPTIONS)
            .concat([{ label: $t('Custom'), value: 'custom' }]);

    return uniq(options);
  }, [display, videoSettings]);

  function updateSettings(key: string, val: string | number | EFPSType | EScaleType) {
    if (['baseRes', 'outputRes'].includes(key)) {
      const [width, height] = (val as string).split('x');

      const settings =
        key === 'baseRes'
          ? {
              baseWidth: Number(width),
              baseHeight: Number(height),
            }
          : {
              outputWidth: Number(width),
              outputHeight: Number(height),
            };

      VideoService.actions.updateVideoSettings(settings, display);
      return;
    }

    VideoService.actions.updateVideoSettings({ [key]: val }, display);
  }

  function onChange(key: keyof IVideoInfo) {
    return (val: IVideoInfoValue) => updateSettings(key, val);
  }

  function selectResolution(key: string, val: string) {
    if (key === 'baseRes') {
      setBaseRes(val);
      if (val === 'custom') {
        setCustomBaseRes('');
        return;
      }
    }

    if (key === 'outputRes') {
      setOutputRes(val);
      if (val === 'custom') {
        setCustomOutputRes('');
        return;
      }
    }

    updateSettings(key, val);
  }

  function setCustomResolution(key: string, val: string) {
    if (key === 'baseRes') {
      setCustomBaseRes(val);
    } else {
      setCustomOutputRes(val);
    }
    updateSettings(key, val);
  }

  function fpsNumValidator(rule: unknown, value: string, callback: Function) {
    if (Number(value) / Number(videoSettings[display].video.fpsDen) > 1000) {
      callback(
        $t(
          'This number is too large for a FPS Denominator of %{fpsDen}, please decrease it or increase the Denominator',
          { fpsDen: videoSettings[display].video.fpsDen },
        ),
      );
    } else {
      callback();
    }
  }

  function fpsDenValidator(rule: unknown, value: string, callback: Function) {
    if (Number(videoSettings[display].video.fpsNum) / Number(value) < 1) {
      callback(
        $t(
          'This number is too large for a FPS Numerator of %{fpsNum}, please decrease it or increase the Numerator',
          { fpsNum: videoSettings[display].video.fpsNum },
        ),
      );
    } else {
      callback();
    }
  }

  /**
   * Sets the FPS type
   * @remark set the same FPS type for both displays
   * If there is a vertical context, update it as well.
   * Otherwise, update the vertical display persisted settings.
   */
  function setFPSTypeData(value: EFPSType) {
    setFPSType(value);
    updateSettings('fpsType', value);
    updateSettings('fpsNum', 30);
    updateSettings('fpsDen', 1);
  }

  /**
   * Sets Common FPS
   * @remark set the same Common FPS for both displays
   * If there is a vertical context, update it as well.
   * Otherwise, update the vertical display persisted settings.
   */
  function setCommonFPS(value: string) {
    const [fpsNum, fpsDen] = value.split('-');

    updateSettings('fpsNum', Number(fpsNum));
    updateSettings('fpsDen', Number(fpsDen));
  }

  /**
   * Sets Integer FPS
   * @remark set the same Integer FPS for both displays
   * If there is a vertical context, update it as well.
   * Otherwise, update the vertical display persisted settings.
   */
  function setIntegerFPS(value: string) {
    updateSettings('fpsInt', Number(value));
    if (Number(value) > 0 && Number(value) < 1001) {
      updateSettings('fpsNum', Number(value));
      updateSettings('fpsDen', 1);
    }
  }

  /**
   * Sets FPS
   * @remark Set the same FPS for both displays.
   * If there is a vertical context, update it as well.
   * Otherwise, update the vertical display persisted settings.
   */
  function setFPS(key: 'fpsNum' | 'fpsDen', value: string) {
    if (
      !invalidFps(videoSettings[display].video.fpsNum, videoSettings[display].video.fpsDen) &&
      Number(value) > 0
    ) {
      updateSettings(key, Number(value));
    }
  }

  const metadata = {
    baseRes: {
      type: 'list',
      label: $t('Base (Canvas) Resolution'),
      options: baseResOptions,
      onChange: (val: string) => selectResolution('baseRes', val),
      disabled: cantEditFields,
      children: {
        customBaseRes: {
          type: 'text',
          label: $t('Custom Base Resolution'),
          rules: [resolutionValidator],
          onChange: (val: string) => setCustomResolution('baseRes', val),
          displayed: baseRes === 'custom',
          disabled: cantEditFields,
        },
      },
    },
    outputRes: {
      type: 'list',
      label: $t('Output (Scaled) Resolution'),
      options: outputResOptions,
      onChange: (val: string) => selectResolution('outputRes', val),
      disabled: cantEditFields,
      children: {
        customOutputRes: {
          type: 'text',
          label: $t('Custom Output Resolution'),
          rules: [resolutionValidator],
          onChange: (val: string) => setCustomResolution('outputRes', val),
          displayed: outputRes === 'custom',
          disabled: cantEditFields,
        },
      },
    },
    scaleType: {
      type: 'list',
      label: $t('Downscale Filter'),
      onChange: (val: EScaleType) => updateSettings('scaleType', val),
      options: [
        {
          label: $t('Bilinear (Fastest, but blurry if scaling)'),
          value: EScaleType.Bilinear,
        },
        { label: $t('Bicubic (Sharpened scaling, 16 samples)'), value: EScaleType.Bicubic },
        { label: $t('Lanczos (Sharpened scaling, 32 samples)'), value: EScaleType.Lanczos },
      ],
      disabled: cantEditFields,
    },
    fpsType: {
      type: 'list',
      label: $t('FPS Type'),
      onChange: (val: EFPSType) => setFPSTypeData(val),
      options: [
        { label: $t('Common FPS Values'), value: EFPSType.Common },
        { label: $t('Integer FPS Values'), value: EFPSType.Integer },
        { label: $t('Fractional FPS Values'), value: EFPSType.Fractional },
      ],
      disabled: cantEditFields,
      children: {
        fpsCom: {
          type: 'list',
          label: $t('Common FPS Values'),
          options: FPS_OPTIONS,
          onChange: (val: string) => setCommonFPS(val),
          displayed: values.fpsType === EFPSType.Common,
          disabled: cantEditFields,
        },
        fpsInt: {
          type: 'number',
          label: $t('FPS Value'),
          onChange: (val: string) => setIntegerFPS(val),
          rules: [{ max: 1000, min: 1, message: $t('FPS Value must be between 1 and 1000') }],
          displayed: values.fpsType === EFPSType.Integer,
          disabled: cantEditFields,
        },
        fpsNum: {
          type: 'number',
          label: $t('FPS Numerator'),
          onChange: (val: string) => setFPS('fpsNum', val),
          rules: [
            { validator: fpsNumValidator },
            {
              min: 1,
              message: $t('%{fieldName} must be greater than 0', {
                fieldName: $t('FPS Numerator'),
              }),
            },
          ],
          displayed: values.fpsType === EFPSType.Fractional,
          disabled: cantEditFields,
        },
        fpsDen: {
          type: 'number',
          label: $t('FPS Denominator'),
          onChange: (val: string) => setFPS('fpsDen', val),
          rules: [
            { validator: fpsDenValidator },
            {
              min: 1,
              message: $t('%{fieldName} must be greater than 0', {
                fieldName: $t('FPS Denominator'),
              }),
            },
          ],
          displayed: values.fpsType === EFPSType.Fractional,
          disabled: cantEditFields,
        },
      },
    },
  };

  function toggleDualOutput(value: boolean) {
    if (UserService.isLoggedIn) {
      setShowDualOutput();
    } else {
      handleShowModal(value);
    }
  }

  function setShowDualOutput() {
    if (StreamingService.views.isMidStreamMode) {
      message.error({
        content: $t('Cannot toggle Dual Output while live.'),
      });
    } else if (TransitionsService.views.studioMode) {
      message.error({
        content: $t('Cannot toggle Dual Output while in Studio Mode.'),
      });
    } else {
      // show warning message if selective recording is active
      if (!dualOutputMode && StreamingService.state.selectiveRecording) {
        remote.dialog
          .showMessageBox(Utils.getChildWindow(), {
            title: 'Vertical Display Disabled',
            message: $t(
              'Dual Output can’t be displayed - Selective Recording only works with horizontal sources and disables editing the vertical output scene. Please disable selective recording from Sources to set up Dual Output.',
            ),
            buttons: [$t('OK')],
          })
          .catch(() => {});
      }

      // toggle dual output
      DualOutputService.actions.setDualOutputMode(!dualOutputMode);
      UsageStatisticsService.recordFeatureUsage('DualOutput');
      UsageStatisticsService.recordAnalyticsEvent('DualOutput', {
        type: 'ToggleOnDualOutput',
        source: 'VideoSettings',
        isPrime: UserService.isPrime,
        platforms: StreamingService.views.linkedPlatforms,
        tiktokStatus: TikTokService.scope,
      });
    }
  }

  function handleAuth() {
    WindowsService.actions.closeChildWindow();
    UserService.actions.showLogin();
    const onboardingCompleted = OnboardingService.onboardingCompleted.subscribe(() => {
      DualOutputService.actions.setDualOutputMode();
      SettingsService.actions.showSettings('Video');
      onboardingCompleted.unsubscribe();
    });
  }

  function handleShowModal(status: boolean) {
    WindowsService.actions.updateStyleBlockers('child', status);
    setShowModal(status);
  }

  return (
    <div className={styles.container}>
      <div className={styles.videoSettingsHeader}>
        <h2>{$t('Video')}</h2>
        <DualOutputToggle
          value={dualOutputMode}
          onChange={toggleDualOutput}
          disabled={cantEditFields}
          placement="bottomRight"
          lightShadow
        />
      </div>
      {dualOutputMode && <Tabs onChange={setDisplay} />}
      <ObsSettingsSection>
        <FormFactory
          name="video-settings"
          values={values}
          metadata={metadata}
          onChange={onChange}
          formOptions={{ layout: 'vertical' }}
        />
      </ObsSettingsSection>
      <AuthModal
        id="login-modal"
        prompt={$t('Please log in to enable dual output. Would you like to log in now?')}
        showModal={showModal}
        handleShowModal={handleShowModal}
        handleAuth={handleAuth}
      />
    </div>
  );
}

VideoSettings.page = 'Video';
