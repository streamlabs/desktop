import { TObsFormData, TObsValue } from 'components/obs/inputs/ObsInput';
import { getBestSettingsForNiconico } from './niconico-optimization';
import {
  EncoderType,
  ISettingsAccessor,
  OptimizationKey,
  OptimizeSettings,
  SettingsKeyAccessor,
} from './optimizer';
import { ISettingsSubCategory } from './settings-api';

jest.mock('./settings-api');
jest.mock('services/i18n', () => ({
  $t: (x: string) => x,
}));

const outputSettings: ISettingsSubCategory[] = [
  {
    nameSubCategory: 'Untitled',
    parameters: [
      {
        name: 'Mode',
        description: 'outputMode',
        value: 'Simple',
      },
    ],
  },
  {
    nameSubCategory: 'Streaming',
    parameters: [
      {
        name: 'StreamEncoder',
        description: 'StreamEncoder',
        value: 'qsv',
        options: [{ value: 'qsv', description: 'qsv' }],
      },
    ],
  },
];

class MockSettingAccessor implements ISettingsAccessor {
  getSettingsFormData(categoryName: string): ISettingsSubCategory[] {
    if (categoryName === 'Output') {
      return outputSettings;
    }
    return [];
  }
  findSetting(
    settings: ISettingsSubCategory[],
    category: string,
    setting: string,
  ): TObsFormData[number] | undefined {
    for (const subCategory of settings) {
      if (subCategory.nameSubCategory !== category) continue;
      for (const parameter of subCategory.parameters) {
        if (parameter.name === setting) return parameter;
      }
    }
    return undefined;
  }
  findSettingValue(
    settings: ISettingsSubCategory[],
    category: string,
    setting: string,
  ): TObsValue | undefined {
    return this.findSetting(settings, category, setting)?.value;
  }
  setSettings(_categoryName: string, _settingsData: ISettingsSubCategory[]): void {}
}

test('mock outputSettings', () => {
  const settings = new SettingsKeyAccessor(new MockSettingAccessor());
  expect(settings.hasSpecificValue(OptimizationKey.encoder, EncoderType.qsv)).toBe(true);
});

describe('getBestSettingsForNiconico', () => {
  const accessor = new SettingsKeyAccessor(new MockSettingAccessor());
  const commonSettings: Partial<OptimizeSettings> = {
    simpleUseAdvanced: true,
    audioSampleRate: 48000,
    fpsCommon: '30',
    fpsType: 'Common FPS Values',
    outputMode: 'Simple',
  };
  const x264Settings: Partial<OptimizeSettings> = {
    ...commonSettings,
    encoder: EncoderType.x264,
    encoderPreset: 'ultrafast',
  };
  const qsvSettings: Partial<OptimizeSettings> = {
    ...commonSettings,
    encoder: EncoderType.qsv,
    targetUsage: 'speed',
  };

  test.each([
    [
      1000,
      288,
      30,
      false,
      { ...x264Settings, quality: '512x288', audioBitrate: '96', videoBitrate: 1000 - 96 },
    ],
    [
      2000,
      450,
      30,
      false,
      { ...x264Settings, quality: '800x450', audioBitrate: '192', videoBitrate: 2000 - 192 },
    ],
    [
      4000,
      720,
      30,
      false,
      { ...x264Settings, quality: '1280x720', audioBitrate: '192', videoBitrate: 4000 - 192 },
    ],
    [
      6000,
      1080,
      60,
      true,
      {
        ...qsvSettings,
        quality: '1920x1080',
        audioBitrate: '192',
        videoBitrate: 6000 - 192,
        fpsCommon: '60',
      },
    ],
  ])(
    'bitrate: %p, height: %p, fps: %p, useHardwareEncoder: %p',
    (bitrate, height, fps, useHardwareEncoder, shouldBe) => {
      const settings = getBestSettingsForNiconico(
        { bitrate, height, fps, useHardwareEncoder },
        accessor,
      );
      expect(settings).toEqual(shouldBe);
    },
  );
});
