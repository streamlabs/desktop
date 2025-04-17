import * as remote from '@electron/remote';
import React, { useEffect, useMemo, useState, useRef } from 'react';
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
import uniqBy from 'lodash/uniqBy';

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

  const dualOutputMode = DualOutputService.views.dualOutputMode;
  const cantEditFields = StreamingService.views.isStreaming || StreamingService.views.isRecording;

  const [display, setDisplay] = useState<TDisplayType>('horizontal');
  const videoSettings = useRealmObject(Services.VideoService.state[display].video);
  const [showModal, setShowModal] = useState(false);
  const [baseRes, setBaseRes] = useState(videoSettings.baseRes);
  const [customBaseRes, setCustomBaseRes] = useState(videoSettings.baseRes);
  const [outputRes, setOutputRes] = useState(videoSettings.outputRes);
  const [customOutputRes, setCustomOutputRes] = useState(videoSettings.outputRes);
  const [fpsType, setFPSType] = useState(videoSettings.values.fpsType);

  useEffect(() => {
    const baseRes = !baseResOptions.find(opt => opt.value === videoSettings.baseRes)
      ? 'custom'
      : videoSettings.baseRes;
    const outputRes = !outputResOptions.find(opt => opt.value === videoSettings.outputRes)
      ? 'custom'
      : videoSettings.outputRes;
    setBaseRes(baseRes);
    setCustomBaseRes(videoSettings.baseRes);
    setOutputRes(outputRes);
    setCustomOutputRes(videoSettings.outputRes);
    setFPSType(videoSettings.values.fpsType);
  }, [display]);

  const values: Dictionary<TInputValue> = useMemo(() => {
    return {
      ...videoSettings.values,
      baseRes,
      outputRes,
      customBaseRes,
      customOutputRes,
      fpsType,
    };
  }, [
    display,
    videoSettings.values.fpsNum,
    fpsType,
    baseRes,
    outputRes,
    customBaseRes,
    customOutputRes,
  ]);

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

    return uniqBy(options, 'value');
  }, [display, monitorResolutions]);

  const outputResOptions = useMemo(() => {
    const baseRes = `${videoSettings.baseWidth}x${videoSettings.baseHeight}`;

    const options =
      display === 'vertical'
        ? VERTICAL_OUTPUT_RES_OPTIONS
        : [{ label: baseRes, value: baseRes }]
            .concat(OUTPUT_RES_OPTIONS)
            .concat(VERTICAL_OUTPUT_RES_OPTIONS)
            .concat([{ label: $t('Custom'), value: 'custom' }]);

    return uniqBy(options, 'value');
  }, [display, videoSettings.baseWidth]);

  function updateSettings(patch: Dictionary<string | number | EFPSType | EScaleType>) {
    const formattedSettings: Dictionary<string | number | EFPSType | EScaleType> = {};
    let syncDisplays = false;
    Object.keys(patch).forEach((key: string) => {
      if (['baseRes', 'outputRes'].includes(key)) {
        const [width, height] = (patch[key] as string).split('x');

        if (key === 'baseRes') {
          formattedSettings.baseWidth = Number(width);
          formattedSettings.baseHeight = Number(height);
        } else {
          formattedSettings.outputWidth = Number(width);
          formattedSettings.outputHeight = Number(height);
        }
      }
      if (dualOutputMode && /fps/.test(key)) syncDisplays = true;
      formattedSettings[key] = patch[key];
    });
    console.log('updating settings', formattedSettings);
    VideoService.actions.updateVideoSettings(formattedSettings, display);
    // Sync FPS settings with other display in Dual Output
    if (syncDisplays) {
      const otherDisplay = display === 'horizontal' ? 'vertical' : 'horizontal';
      VideoService.actions.updateVideoSettings(formattedSettings, otherDisplay);
    }
  }

  function onChange(key: keyof IVideoInfo) {
    return (val: IVideoInfoValue) => updateSettings({ [key]: val });
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

    updateSettings({ [key]: val });
  }

  function setCustomResolution(key: string, val: string) {
    if (key === 'baseRes') {
      setCustomBaseRes(val);
    } else {
      setCustomOutputRes(val);
    }
    updateSettings({ [key]: val });
  }

  function fpsNumValidator(rule: unknown, value: string, callback: Function) {
    if (Number(value) / Number(videoSettings.values.fpsDen) > 1000) {
      callback(
        $t(
          'This number is too large for a FPS Denominator of %{fpsDen}, please decrease it or increase the Denominator',
          { fpsDen: videoSettings.values.fpsDen },
        ),
      );
    } else {
      callback();
    }
  }

  function fpsDenValidator(rule: unknown, value: string, callback: Function) {
    if (Number(videoSettings.values.fpsNum) / Number(value) < 1) {
      callback(
        $t(
          'This number is too large for a FPS Numerator of %{fpsNum}, please decrease it or increase the Numerator',
          { fpsNum: videoSettings.values.fpsNum },
        ),
      );
    } else {
      callback();
    }
  }

  function setFPSTypeData(value: EFPSType) {
    updateSettings({
      fpsType: value,
      fpsNum: 30,
      fpsDen: 1,
    });
    setFPSType(value);
  }

  function setCommonFPS(value: string) {
    const [fpsNum, fpsDen] = value.split('-');
    updateSettings({
      fpsNum: Number(fpsNum),
      fpsDen: Number(fpsDen),
    });
  }

  function setIntegerFPS(value: string) {
    if (Number(value) > 0 && Number(value) < 1001) {
      updateSettings({
        fpsNum: Number(value),
        fpsDen: 1,
      });
    }
  }

  function setFPS(key: 'fpsNum' | 'fpsDen', value: string) {
    if (
      !invalidFps(videoSettings.values.fpsNum, videoSettings.values.fpsDen) &&
      Number(value) > 0
    ) {
      updateSettings({ [key]: Number(value) });
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
