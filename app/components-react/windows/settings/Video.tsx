import * as remote from '@electron/remote';
import React from 'react';
import { useModule, injectState } from 'slap';
import { Services } from '../../service-provider';
import { message } from 'antd';
import FormFactory, { TInputValue } from 'components-react/shared/inputs/FormFactory';
import { EScaleType, EFPSType, IVideoInfo } from '../../../../obs-api';
import { $t } from 'services/i18n';
import styles from './Common.m.less';
import Tabs from 'components-react/shared/Tabs';
import { invalidFps, IVideoInfoValue, TDisplayType } from 'services/settings-v2/video';
import { AuthModal } from 'components-react/shared/AuthModal';
import Utils from 'services/utils';
import DualOutputToggle from '../../shared/DualOutputToggle';

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

class VideoSettingsModule {
  service = Services.VideoSettingsService;
  userService = Services.UserService;
  dualOutputService = Services.DualOutputService;
  streamingService = Services.StreamingService;
  tiktokService = Services.TikTokService;

  get display(): TDisplayType {
    return this.state.display;
  }

  get cantEditFields(): boolean {
    return this.streamingService.views.isStreaming || this.streamingService.views.isRecording;
  }

  get values(): Dictionary<TInputValue> {
    const display = this.state.display;
    const vals = this.service.values[display];
    const baseRes = display !== 'vertical' && this.state?.customBaseRes ? 'custom' : vals.baseRes;
    const outputRes =
      display !== 'vertical' && this.state?.customOutputRes ? 'custom' : vals.outputRes;
    return {
      ...vals,
      baseRes,
      outputRes,
      customBaseRes: this.state.customBaseResValue,
      customOutputRes: this.state.customOutputResValue,
      fpsNum: this.state.fpsNum,
      fpsDen: this.state.fpsDen,
      fpsInt: this.state.fpsInt,
    };
  }

  state = injectState({
    display: 'horizontal' as TDisplayType,
    showModal: false,
    showDualOutputSettings: this.dualOutputService.views.dualOutputMode,
    customBaseRes: !this.baseResOptions.find(
      opt => opt.value === this.service.values.horizontal.baseRes,
    ),
    customOutputRes: !this.outputResOptions.find(
      opt => opt.value === this.service.values.horizontal.outputRes,
    ),
    customBaseResValue: this.service.values.horizontal.baseRes,
    customOutputResValue: this.service.values.horizontal.outputRes,
    fpsNum: this.service.values.horizontal.fpsNum,
    fpsDen: this.service.values.horizontal.fpsDen,
    fpsInt: this.service.values.horizontal.fpsNum,
  });

  get metadata() {
    return {
      baseRes: {
        type: 'list',
        label: $t('Base (Canvas) Resolution'),
        options: this.baseResOptions,
        onChange: (val: string) => this.selectResolution('baseRes', val),
        disabled: this.cantEditFields,
        children: {
          customBaseRes: {
            type: 'text',
            label: $t('Custom Base Resolution'),
            rules: [this.resolutionValidator],
            onChange: (val: string) => this.setResolution('baseRes', val),
            displayed: this.state.customBaseRes,
            disabled: this.cantEditFields,
          },
        },
      },
      outputRes: {
        type: 'list',
        label: $t('Output (Scaled) Resolution'),
        options: this.outputResOptions,
        onChange: (val: string) => this.selectResolution('outputRes', val),
        disabled: this.cantEditFields,
        children: {
          customOutputRes: {
            type: 'text',
            label: $t('Custom Output Resolution'),
            rules: [this.resolutionValidator],
            onChange: (val: string) => this.setResolution('outputRes', val),
            displayed: this.state.customOutputRes,
            disabled: this.cantEditFields,
          },
        },
      },
      scaleType: {
        type: 'list',
        label: $t('Downscale Filter'),
        onChange: (val: EScaleType) => this.setScaleType(val),
        options: [
          {
            label: $t('Bilinear (Fastest, but blurry if scaling)'),
            value: EScaleType.Bilinear,
          },
          { label: $t('Bicubic (Sharpened scaling, 16 samples)'), value: EScaleType.Bicubic },
          { label: $t('Lanczos (Sharpened scaling, 32 samples)'), value: EScaleType.Lanczos },
        ],
        disabled: this.cantEditFields,
      },
      fpsType: {
        type: 'list',
        label: $t('FPS Type'),
        onChange: (val: EFPSType) => this.setFPSType(val),
        options: [
          { label: $t('Common FPS Values'), value: EFPSType.Common },
          { label: $t('Integer FPS Values'), value: EFPSType.Integer },
          { label: $t('Fractional FPS Values'), value: EFPSType.Fractional },
        ],
        disabled: this.cantEditFields,

        children: {
          fpsCom: {
            type: 'list',
            label: $t('Common FPS Values'),
            options: FPS_OPTIONS,
            onChange: (val: string) => this.setCommonFPS(val),
            displayed: this.values.fpsType === EFPSType.Common,
            disabled: this.cantEditFields,
          },
          fpsInt: {
            type: 'number',
            label: $t('FPS Value'),
            onChange: (val: string) => this.setIntegerFPS(val),
            rules: [{ max: 1000, min: 1, message: $t('FPS Value must be between 1 and 1000') }],
            displayed: this.values.fpsType === EFPSType.Integer,
            disabled: this.cantEditFields,
          },
          fpsNum: {
            type: 'number',
            label: $t('FPS Numerator'),
            onChange: (val: string) => this.setFPS('fpsNum', val),
            rules: [
              { validator: this.fpsNumValidator.bind(this) },
              {
                min: 1,
                message: $t('%{fieldName} must be greater than 0', {
                  fieldName: $t('FPS Numerator'),
                }),
              },
            ],
            displayed: this.values.fpsType === EFPSType.Fractional,
            disabled: this.cantEditFields,
          },
          fpsDen: {
            type: 'number',
            label: $t('FPS Denominator'),
            onChange: (val: string) => this.setFPS('fpsDen', val),
            rules: [
              { validator: this.fpsDenValidator.bind(this) },
              {
                min: 1,
                message: $t('%{fieldName} must be greater than 0', {
                  fieldName: $t('FPS Denominator'),
                }),
              },
            ],
            displayed: this.values.fpsType === EFPSType.Fractional,
            disabled: this.cantEditFields,
          },
        },
      },
    };
  }

  get baseResOptions() {
    if (this.state?.display === 'vertical') {
      return VERTICAL_CANVAS_OPTIONS;
    }

    return CANVAS_RES_OPTIONS.concat(this.monitorResolutions)
      .concat(VERTICAL_CANVAS_OPTIONS)
      .concat([{ label: $t('Custom'), value: 'custom' }]);
  }

  get outputResOptions() {
    if (this.state?.display === 'vertical') {
      return VERTICAL_OUTPUT_RES_OPTIONS;
    }

    const baseRes = `${this.service.state.horizontal.baseWidth}x${this.service.state.horizontal.baseHeight}`;
    if (!OUTPUT_RES_OPTIONS.find(opt => opt.value === baseRes)) {
      return [{ label: baseRes, value: baseRes }]
        .concat(OUTPUT_RES_OPTIONS)
        .concat(VERTICAL_OUTPUT_RES_OPTIONS)
        .concat([{ label: $t('Custom'), value: 'custom' }]);
    }
    return OUTPUT_RES_OPTIONS.concat(VERTICAL_OUTPUT_RES_OPTIONS).concat([
      { label: $t('Custom'), value: 'custom' },
    ]);
  }

  get monitorResolutions() {
    const resOptions: { label: string; value: string }[] = [];
    const displays = remote.screen.getAllDisplays();
    displays.forEach(display => {
      const size = display.size;
      const res = `${size.width}x${size.height}`;
      if (
        !resOptions.find(opt => opt.value === res) &&
        !CANVAS_RES_OPTIONS.find(opt => opt.value === res)
      ) {
        resOptions.push({ label: res, value: res });
      }
    });
    return resOptions;
  }

  get resolutionValidator() {
    return {
      message: $t('The resolution must be in the format [width]x[height] (i.e. 1920x1080)'),
      pattern: /^[0-9]+x[0-9]+$/,
    };
  }

  fpsNumValidator(rule: unknown, value: string, callback: Function) {
    if (Number(value) / Number(this.values.fpsDen) > 1000) {
      callback(
        $t(
          'This number is too large for a FPS Denominator of %{fpsDen}, please decrease it or increase the Denominator',
          { fpsDen: this.values.fpsDen },
        ),
      );
    } else {
      callback();
    }
  }

  fpsDenValidator(rule: unknown, value: string, callback: Function) {
    if (Number(this.values.fpsNum) / Number(value) < 1) {
      callback(
        $t(
          'This number is too large for a FPS Numerator of %{fpsNum}, please decrease it or increase the Numerator',
          { fpsNum: this.values.fpsNum },
        ),
      );
    } else {
      callback();
    }
  }

  setResolution(key: string, value: string) {
    const display = this.state.display;
    if (key === 'outputRes') {
      this.state.setCustomOutputResValue(value);
    } else if (key === 'baseRes') {
      this.state.setCustomBaseResValue(value);
    }

    if (this.resolutionValidator.pattern.test(value)) {
      const [width, height] = value.split('x');
      const prefix = key === 'baseRes' ? 'base' : 'output';

      const settings = {
        [`${prefix}Width`]: Number(width),
        [`${prefix}Height`]: Number(height),
      };

      // set base or output resolutions to vertical dimensions for horizontal display
      // when setting vertical dimensions
      if (display === 'horizontal') {
        const otherPrefix = key === 'baseRes' ? 'output' : 'base';
        const customRes = this.state.customBaseRes || this.state.customOutputRes;
        const verticalValues = VERTICAL_CANVAS_OPTIONS.map(option => option.value);
        const horizontalValues = CANVAS_RES_OPTIONS.concat(OUTPUT_RES_OPTIONS).map(
          option => option.value,
        );
        const baseRes = this.values.baseRes.toString();
        const outputRes = this.values.outputRes.toString();

        const shouldSyncVertical =
          !customRes &&
          verticalValues.includes(value) &&
          !verticalValues.includes(baseRes) &&
          !verticalValues.includes(outputRes);

        const shouldSyncHorizontal =
          !customRes &&
          !verticalValues.includes(value) &&
          !horizontalValues.includes(baseRes) &&
          !horizontalValues.includes(outputRes);

        if (shouldSyncVertical || shouldSyncHorizontal) {
          settings[`${otherPrefix}Width`] = Number(width);
          settings[`${otherPrefix}Height`] = Number(height);
        }
      }
      this.service.actions.setSettings(settings, display);
    }
  }

  selectResolution(key: string, value: string) {
    if (value === 'custom') {
      this.setCustomResolution(key, true);
      this.setResolution(key, '');
    } else {
      this.setCustomResolution(key, false);
      this.setResolution(key, value);
    }
  }

  setCustomResolution(key: string, value: boolean) {
    if (key === 'baseRes') {
      this.state.setCustomBaseRes(value);
    } else {
      this.state.setCustomOutputRes(value);
    }
  }

  /**
   * Sets the Scale Type
   * @remark set the same FPS type for both displays
   * If there is a vertical context, update it as well.
   * Otherwise, update the vertical display persisted settings.
   */

  setScaleType(value: EScaleType) {
    this.service.actions.setVideoSetting('scaleType', value, 'horizontal');

    if (this.service.contexts.vertical) {
      this.service.actions.setVideoSetting('scaleType', value, 'vertical');
    } else {
      this.dualOutputService.actions.setVideoSetting({ scaleType: value }, 'vertical');
    }
  }

  /**
   * Sets the FPS type
   * @remark set the same FPS type for both displays
   * If there is a vertical context, update it as well.
   * Otherwise, update the vertical display persisted settings.
   */
  setFPSType(value: EFPSType) {
    this.service.actions.setVideoSetting('fpsType', value, 'horizontal');
    this.service.actions.setVideoSetting('fpsNum', 30, 'horizontal');
    this.service.actions.setVideoSetting('fpsDen', 1, 'horizontal');
    this.service.actions.syncFPSSettings();
  }

  /**
   * Sets Common FPS
   * @remark set the same Common FPS for both displays
   * If there is a vertical context, update it as well.
   * Otherwise, update the vertical display persisted settings.
   */
  setCommonFPS(value: string) {
    const [fpsNum, fpsDen] = value.split('-');

    this.service.actions.setVideoSetting('fpsNum', Number(fpsNum), 'horizontal');
    this.service.actions.setVideoSetting('fpsDen', Number(fpsDen), 'horizontal');
    this.service.actions.syncFPSSettings();
  }
  /**
   * Sets Integer FPS
   * @remark set the same Integer FPS for both displays
   * If there is a vertical context, update it as well.
   * Otherwise, update the vertical display persisted settings.
   */
  setIntegerFPS(value: string) {
    this.state.setFpsInt(Number(value));
    if (Number(value) > 0 && Number(value) < 1001) {
      this.service.actions.setVideoSetting('fpsNum', Number(value), 'horizontal');
      this.service.actions.setVideoSetting('fpsDen', 1, 'horizontal');
      this.service.actions.syncFPSSettings();
    }
  }

  /**
   * Sets FPS
   * @remark Set the same FPS for both displays.
   * If there is a vertical context, update it as well.
   * Otherwise, update the vertical display persisted settings.
   */
  setFPS(key: 'fpsNum' | 'fpsDen', value: string) {
    if (key === 'fpsNum') {
      this.state.setFpsNum(Number(value));
    } else {
      this.state.setFpsDen(Number(value));
    }
    if (!invalidFps(this.state.fpsNum, this.state.fpsDen) && Number(value) > 0) {
      this.service.actions.setVideoSetting(key, Number(value), 'horizontal');
      this.service.actions.syncFPSSettings();
    }
  }

  onChange(key: keyof IVideoInfo) {
    return (val: IVideoInfoValue) =>
      this.service.actions.setVideoSetting(key, val, this.state.display);
  }

  setDisplay(display: TDisplayType) {
    this.state.setDisplay(display);

    const customBaseRes = !this.baseResOptions.find(
      opt => opt.value === this.service.values[display].baseRes,
    );
    const customOutputRes = !this.outputResOptions.find(
      opt => opt.value === this.service.values[display].outputRes,
    );
    this.state.setCustomBaseRes(customBaseRes);
    this.state.setCustomOutputRes(customOutputRes);
    this.state.setCustomBaseResValue(this.service.values[display].baseRes);
    this.state.setCustomOutputResValue(this.service.values[display].outputRes);
    this.state.setFpsNum(this.service.values[display].fpsNum);
    this.state.setFpsDen(this.service.values[display].fpsDen);
    this.state.setFpsInt(this.service.values[display].fpsInt);
  }

  toggleDualOutput(value: boolean) {
    if (this.userService.isLoggedIn) {
      this.setShowDualOutput();
    } else {
      this.handleShowModal(value);
    }
  }

  setShowDualOutput() {
    if (Services.StreamingService.views.isMidStreamMode) {
      message.error({
        content: $t('Cannot toggle Dual Output while live.'),
      });
    } else if (Services.TransitionsService.views.studioMode) {
      message.error({
        content: $t('Cannot toggle Dual Output while in Studio Mode.'),
      });
    } else {
      // show warning message if selective recording is active
      if (
        !this.dualOutputService.views.dualOutputMode &&
        Services.StreamingService.state.selectiveRecording
      ) {
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
      this.dualOutputService.actions.setDualOutputMode(
        !this.dualOutputService.views.dualOutputMode,
      );
      this.state.setShowDualOutputSettings(!this.state.showDualOutputSettings);
      Services.UsageStatisticsService.recordFeatureUsage('DualOutput');
      Services.UsageStatisticsService.recordAnalyticsEvent('DualOutput', {
        type: 'ToggleOnDualOutput',
        source: 'VideoSettings',
        isPrime: this.userService.isPrime,
        platforms: this.streamingService.views.linkedPlatforms,
        tiktokStatus: this.tiktokService.scope,
      });
    }
  }

  handleShowModal(status: boolean) {
    Services.WindowsService.actions.updateStyleBlockers('child', status);
    this.state.setShowModal(status);
  }

  handleAuth() {
    Services.WindowsService.actions.closeChildWindow();
    this.userService.actions.showLogin();
    const onboardingCompleted = Services.OnboardingService.onboardingCompleted.subscribe(() => {
      Services.DualOutputService.actions.setDualOutputMode();
      Services.SettingsService.actions.showSettings('Video');
      onboardingCompleted.unsubscribe();
    });
  }
}

export function VideoSettings() {
  const {
    values,
    metadata,
    showDualOutputSettings,
    showModal,
    cantEditFields,
    onChange,
    setDisplay,
    toggleDualOutput,
    handleAuth,
    handleShowModal,
  } = useModule(VideoSettingsModule);

  return (
    <>
      <div className={styles.videoSettingsHeader}>
        <h2>{$t('Video')}</h2>
        <DualOutputToggle
          value={showDualOutputSettings}
          onChange={toggleDualOutput}
          disabled={cantEditFields}
          placement="bottomRight"
          lightShadow
        />
      </div>
      {showDualOutputSettings && <Tabs onChange={setDisplay} />}

      <div className={styles.formSection}>
        <FormFactory
          values={values}
          metadata={metadata}
          onChange={onChange}
          formOptions={{ layout: 'vertical' }}
          name="video-settings"
        />
      </div>
      <AuthModal
        id="login-modal"
        prompt={$t('Please log in to enable dual output. Would you like to log in now?')}
        showModal={showModal}
        handleShowModal={handleShowModal}
        handleAuth={handleAuth}
      />
    </>
  );
}

VideoSettings.page = 'Video';
