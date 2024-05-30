import * as Sentry from '@sentry/vue';
import { IObsInput, IObsListInput, TObsFormData, TObsValue } from 'components/obs/inputs/ObsInput';
import { $t } from 'services/i18n';
import { ISettingsSubCategory } from './settings-api';

export enum EncoderType {
  x264 = 'obs_x264',
  nvenc = 'nvenc',
  nvencNew = 'jim_nvenc',
  amd = 'amd_amf_h264',
  qsv = 'qsv',
  advancedQsv = 'obs_qsv11',
  advancedNvenc = 'ffmpeg_nvenc',
}

export enum OptimizationKey {
  outputMode = 'outputMode',
  quality = 'quality',
  advColorSpace = 'advColorSpace',
  fpsType = 'fpsType',
  fpsCommon = 'fpsCommon',
  encoder = 'encoder',
  simpleUseAdvanced = 'simpleUseAdvanced',
  targetUsage = 'targetUsage',
  encoderPreset = 'encoderPreset',
  NVENCPreset = 'NVENCPreset',
  advRateControl = 'advRateControl',
  videoBitrate = 'videoBitrate',
  advKeyframeInterval = 'advKeyframeInterval',
  advProfile = 'advProfile',
  advX264Tune = 'advX264Tune',
  audioBitrate = 'audioBitrate',
  advAudioTrackIndex = 'advAudioTrackIndex',
  audioSampleRate = 'audioSampleRate',
}

// OptimizationKey のキーと完全対応していること
export type OptimizeSettings = {
  outputMode?: 'Simple' | 'Advanced';
  quality?: string;
  advColorSpace?: '601' | '709';
  fpsType?: 'Common FPS Values' | 'Integer FPS Value' | 'Fractional FPS Value';
  fpsCommon?: string;
  encoder?: EncoderType;
  simpleUseAdvanced?: boolean;
  targetUsage?: 'quality' | 'balanced' | 'speed'; // for QSV
  encoderPreset?:
    | 'ultrafast'
    | 'superfast'
    | 'veryfast'
    | 'faster'
    | 'fast'
    | 'medium'
    | 'slow'
    | 'slower'; // for x264
  NVENCPreset?: 'default' | 'mq' | 'hq' | 'hp' | 'll' | 'llhp' | 'llhq'; // for NVENC
  advRateControl?: 'CBR' | 'VBR' | 'ABR' | 'CRF';
  videoBitrate?: number;
  advKeyframeInterval?: number;
  advProfile?: 'high' | 'main' | 'baseline';
  advX264Tune?: string;
  audioBitrate?: string;
  advAudioTrackIndex?: string;
  audioSampleRate?: 44100 | 48000;
};

export enum CategoryName {
  output = 'Output',
  video = 'Video',
  advanced = 'Advanced',
  audio = 'Audio',
}

export type KeyDescription = {
  key: OptimizationKey;
  category: CategoryName;
  subCategory: string;
  setting: string;
  label?: string;
  lookupValueName?: boolean; //< 値をキーに翻訳を引くかどうか
  dependents?: { values: TObsValue[]; params: KeyDescription[] }[];
};

export const AllKeyDescriptions: KeyDescription[] = [
  {
    key: OptimizationKey.outputMode,
    category: CategoryName.output,
    subCategory: 'Untitled',
    setting: 'Mode',
    lookupValueName: true,
    dependents: [
      {
        values: ['Advanced'],
        params: [
          {
            key: OptimizationKey.encoder,
            category: CategoryName.output,
            subCategory: 'Streaming',
            setting: 'Encoder',
            lookupValueName: true,
            dependents: [
              {
                values: ['obs_x264'],
                params: [
                  {
                    key: OptimizationKey.advRateControl,
                    category: CategoryName.output,
                    subCategory: 'Streaming',
                    setting: 'rate_control',
                    lookupValueName: true,
                    dependents: [
                      {
                        values: ['CBR'],
                        params: [
                          {
                            key: OptimizationKey.videoBitrate,
                            category: CategoryName.output,
                            subCategory: 'Streaming',
                            setting: 'bitrate',
                            label: 'settings.videoBitrate',
                          },
                        ],
                      },
                    ],
                  },
                  {
                    key: OptimizationKey.advKeyframeInterval,
                    category: CategoryName.output,
                    subCategory: 'Streaming',
                    label: 'settings.keyframeInterval',
                    setting: 'keyint_sec',
                  },
                  {
                    key: OptimizationKey.encoderPreset,
                    category: CategoryName.output,
                    subCategory: 'Streaming',
                    setting: 'preset',
                    label: 'settings.encoderPreset',
                  },
                  {
                    key: OptimizationKey.advProfile,
                    category: CategoryName.output,
                    subCategory: 'Streaming',
                    setting: 'profile',
                    lookupValueName: true,
                  },
                  {
                    key: OptimizationKey.advX264Tune,
                    category: CategoryName.output,
                    subCategory: 'Streaming',
                    setting: 'tune',
                    lookupValueName: true,
                  },
                ],
              },
              {
                values: ['qsv'],
                params: [
                  {
                    key: OptimizationKey.targetUsage,
                    category: CategoryName.output,
                    subCategory: 'Streaming',
                    setting: 'QSVPreset',
                  },
                  {
                    key: OptimizationKey.advProfile,
                    category: CategoryName.output,
                    subCategory: 'Streaming',
                    setting: 'profile',
                    lookupValueName: true,
                  },
                  {
                    key: OptimizationKey.advKeyframeInterval,
                    category: CategoryName.output,
                    subCategory: 'Streaming',
                    label: 'settings.keyframeInterval',
                    setting: 'keyint_sec',
                  },
                  // async_depth
                  //    4
                  // max_bitrate (CBRのときはない, VBRのときはある    )
                  // accuracy
                  // convergence
                  // qpi, qpp, qpb, icq_quality, la_depth
                  {
                    key: OptimizationKey.advRateControl,
                    category: CategoryName.output,
                    subCategory: 'Streaming',
                    setting: 'rate_control',
                    lookupValueName: true,
                    dependents: [
                      {
                        values: ['CBR'],
                        params: [
                          {
                            key: OptimizationKey.videoBitrate,
                            category: CategoryName.output,
                            subCategory: 'Streaming',
                            setting: 'bitrate',
                            label: 'settings.videoBitrate',
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                values: ['nvenc', 'jim_nvenc'],
                params: [
                  // 'Rescale' // bool
                  //    'RescaleRes' // '1920x1200' ... '640x400' (10個)
                  // 'rate_control' // 'CBR', 'VBR', 'CQP', 'lossless'
                  //     'bitrate' // int CBR, VBRのときのみ
                  //     'cqp' // int CQPのときのみ
                  // 'keyint_sec' // int
                  // 'preset' // 'default', 'hq', 'hp', 'bd' /* ブルーレイ */, 'll', 'llhq', 'llhp'
                  // 'profile' // 'high', 'main', 'baseline', 'high444p'
                  // 'level' // 'auto', 1, 1.0, 1b, 1.0b, 1.1, 1.2, 1.3, 2, 2.0, 2.1, 2.2,
                  //            3, 3.0, 3.1, 3.2, 4, 4.0, 4.1, 4.2, 5, 5.0, 5.1
                  // '2pass' // bool
                  // 'gpu' // int 0
                  // 'bf' // int 2 // B-フレーム
                  {
                    key: OptimizationKey.NVENCPreset,
                    category: CategoryName.output,
                    subCategory: 'Streaming',
                    setting: 'preset',
                  },
                  {
                    key: OptimizationKey.advProfile,
                    category: CategoryName.output,
                    subCategory: 'Streaming',
                    setting: 'profile',
                    lookupValueName: true,
                  },
                  {
                    key: OptimizationKey.advKeyframeInterval,
                    category: CategoryName.output,
                    subCategory: 'Streaming',
                    label: 'settings.keyframeInterval',
                    setting: 'keyint_sec',
                  },
                  {
                    key: OptimizationKey.advRateControl,
                    category: CategoryName.output,
                    subCategory: 'Streaming',
                    setting: 'rate_control',
                    lookupValueName: true,
                    dependents: [
                      {
                        values: ['CBR'],
                        params: [
                          {
                            key: OptimizationKey.videoBitrate,
                            category: CategoryName.output,
                            subCategory: 'Streaming',
                            setting: 'bitrate',
                            label: 'settings.videoBitrate',
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            key: OptimizationKey.advAudioTrackIndex,
            category: CategoryName.output,
            subCategory: 'Streaming',
            setting: 'TrackIndex',
          },
          {
            key: OptimizationKey.audioBitrate,
            category: CategoryName.output,
            subCategory: 'Audio - Track 1',
            setting: 'Track1Bitrate',
            label: 'settings.audioBitrate',
          },
          {
            key: OptimizationKey.advColorSpace,
            category: CategoryName.advanced,
            subCategory: 'Video',
            setting: 'ColorSpace',
          },
        ],
      },
      {
        values: ['Simple'],
        params: [
          {
            key: OptimizationKey.videoBitrate,
            category: CategoryName.output,
            subCategory: 'Streaming',
            setting: 'VBitrate',
            label: 'settings.videoBitrate',
          },
          {
            key: OptimizationKey.encoder,
            category: CategoryName.output,
            subCategory: 'Streaming',
            setting: 'StreamEncoder',
            lookupValueName: true,
            dependents: [
              {
                values: ['obs_x264'],
                params: [
                  {
                    key: OptimizationKey.simpleUseAdvanced,
                    category: CategoryName.output,
                    subCategory: 'Streaming',
                    setting: 'UseAdvanced',
                    lookupValueName: true,
                    dependents: [
                      {
                        values: [true],
                        params: [
                          {
                            key: OptimizationKey.encoderPreset,
                            category: CategoryName.output,
                            subCategory: 'Streaming',
                            setting: 'Preset',
                            label: 'settings.encoderPreset',
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                values: ['qsv'],
                params: [
                  {
                    key: OptimizationKey.simpleUseAdvanced,
                    category: CategoryName.output,
                    subCategory: 'Streaming',
                    setting: 'UseAdvanced',
                    lookupValueName: true,
                    dependents: [
                      {
                        values: [true],
                        params: [
                          {
                            key: OptimizationKey.targetUsage,
                            category: CategoryName.output,
                            subCategory: 'Streaming',
                            setting: 'QSVPreset',
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                values: ['nvenc', 'jim_nvenc'],
                params: [
                  {
                    key: OptimizationKey.simpleUseAdvanced,
                    category: CategoryName.output,
                    subCategory: 'Streaming',
                    setting: 'UseAdvanced',
                    lookupValueName: true,
                    dependents: [
                      {
                        values: [true],
                        params: [
                          {
                            key: OptimizationKey.NVENCPreset,
                            category: CategoryName.output,
                            subCategory: 'Streaming',
                            setting: 'NVENCPreset',
                            lookupValueName: true,
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            key: OptimizationKey.audioBitrate,
            category: CategoryName.output,
            subCategory: 'Streaming',
            setting: 'ABitrate',
          },
        ],
      },
    ],
  },
  {
    key: OptimizationKey.quality,
    category: CategoryName.video,
    subCategory: 'Untitled',
    setting: 'Output',
    label: 'streaming.resolution',
    lookupValueName: true,
  },
  {
    key: OptimizationKey.fpsType,
    category: CategoryName.video,
    subCategory: 'Untitled',
    setting: 'FPSType',
    lookupValueName: true,
    dependents: [
      {
        values: ['Common FPS Values'],
        params: [
          {
            key: OptimizationKey.fpsCommon,
            category: CategoryName.video,
            subCategory: 'Untitled',
            setting: 'FPSCommon',
            label: 'streaming.FPS',
          },
        ],
      },
    ],
  },
  {
    key: OptimizationKey.audioSampleRate,
    category: CategoryName.audio,
    subCategory: 'Untitled',
    setting: 'SampleRate',
    label: 'stream.sampleRate',
    lookupValueName: true,
  },
];

export interface OptimizedSettings {
  best: OptimizeSettings;
  current: OptimizeSettings;
  delta: OptimizeSettings;
  info: [
    CategoryName,
    {
      key: string;
      name: string;
      currentValue: string;
      newValue?: string;
    }[],
  ][];
}

/**
 * i18n用pathを組み立てる。
 * 空白を含む階層はドット記法で接続出来ないので置き換える
 */
function i18nPath(top: string, ...args: string[]): string {
  return (
    top +
    [...args]
      .map(s => {
        if (typeof s !== 'string') {
          s = (s as any).toString();
        }
        if (s.match(/\s/)) {
          return `['${s}']`;
        }
        return `.${s}`;
      })
      .join('')
  );
}

class OptKeyProperty {
  key: OptimizationKey;
  category: CategoryName;
  subCategory: string;
  setting: string;

  private _label: string;
  private lookupValueName: boolean;

  constructor(keyDescription: KeyDescription) {
    this.key = keyDescription.key;
    this.category = keyDescription.category;
    this.subCategory = keyDescription.subCategory;
    this.setting = keyDescription.setting;
    if (keyDescription.label) {
      this._label = keyDescription.label;
    } else {
      this._label = i18nPath(
        'settings',
        keyDescription.category,
        keyDescription.subCategory,
        keyDescription.setting,
        'name',
      );
    }
    this.lookupValueName = keyDescription.lookupValueName;
  }

  get label(): string {
    const t = $t(this._label);
    if (t !== this._label) {
      return t;
    }
    console.warn(`label '${this._label}' not found for ${this.key}`);
    return this.setting;
  }

  value(v: any): string {
    if (v === undefined) {
      const path = i18nPath('settings', this.category, this.subCategory, this.setting);
      Sentry.withScope(scope => {
        scope.setLevel('info');
        scope.setTag('optimization.key', this.key);
        scope.setTag('settings.path', path);
        scope.setFingerprint(['OptKeyProperty', 'value(undefined)']);
        Sentry.captureMessage(`OptKeyProperty: value(undefined): ${path}`);
      });
      return;
    }
    if (this.lookupValueName) {
      const t = i18nPath('settings', this.category, this.subCategory, this.setting, v);
      const name = $t(t);
      if (t !== name) {
        return name;
      }
    }
    return v;
  }
}

type OptimizeItem = {
  key: string;
  name: string;
  currentValue: string;
  newValue?: string;
};

/** KeyDescription を OptimizeSettings にある分岐点に沿う物だけ列挙する
 * @param values
 * @param desc
 */
export function* iterateKeyDescriptions(
  values: OptimizeSettings,
  desc: KeyDescription[],
): IterableIterator<KeyDescription> {
  for (const item of desc) {
    if (values.hasOwnProperty(item.key)) {
      if (item.dependents) {
        const newItem = Object.assign({}, item);
        newItem.dependents = [];
        yield newItem;
        for (const dependent of item.dependents) {
          if (dependent.values.includes(values[item.key])) {
            yield* iterateKeyDescriptions(values, dependent.params);
          }
        }
      } else {
        yield item;
      }
    }
  }
}

function* iterateAllKeyDescriptions(
  keyDescriptionis: KeyDescription[],
): IterableIterator<KeyDescription> {
  for (const item of keyDescriptionis) {
    yield item;
    if (item.dependents) {
      for (const keyParams of item.dependents) {
        yield* iterateAllKeyDescriptions(keyParams.params);
      }
    }
  }
}

/** items の中のいずれかの要素を values が保持しているかを再帰的に確認する
 */
function isDependOnItems(values: OptimizeSettings, items: KeyDescription[]): boolean {
  for (const item of items) {
    if (values.hasOwnProperty(item.key)) {
      return true;
    }
    if (item.dependents) {
      for (const dependent of item.dependents) {
        if (isDependOnItems(values, dependent.params)) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * source を keysNeededに存在するキーに必要なだけの内容に削減したものを返す。
 * @param source
 * @param keysNeeded
 */
export function filterKeyDescriptions(
  keysNeeded: Set<OptimizationKey> | OptimizeSettings,
  source: KeyDescription[],
): KeyDescription[] {
  const result: KeyDescription[] = [];
  const keys = keysNeeded instanceof Set ? keysNeeded : new Set(Object.keys(keysNeeded));

  for (const item of source) {
    const key = item.key;
    if (item.dependents && item.dependents.length > 0) {
      const newItem = Object.assign({}, item);
      delete newItem.dependents;
      const newDependents = [];
      for (const dependent of item.dependents) {
        const params = filterKeyDescriptions(keysNeeded, dependent.params);
        if (params.length > 0) {
          const dep = Object.assign({}, dependent);
          dep.params = params;
          newDependents.push(dep);
        }
      }

      if (newDependents.length > 0) {
        newItem.dependents = newDependents;
      }
      if (newDependents.length > 0 || keys.has(key)) {
        result.push(newItem);
      }
    } else {
      if (keys.has(key)) {
        result.push(item);
      }
    }
  }
  return result;
}

/** params の中に、 OptimizationKey 型の全ての値を key として保持しているかどうかを確認する。
 */
function validateKeyDescriptions(params: KeyDescription[]) {
  // ここは全ての枝を列挙する
  const actual = new Set<string>(Array.from(iterateAllKeyDescriptions(params)).map(d => d.key));
  const missing = [];
  for (const key of Object.values(OptimizationKey)) {
    if (!actual.has(key)) {
      missing.push(key);
    }
  }
  if (missing.length > 0) {
    console.error(`niconico-optimization: missing keys in keyDescriptions: ${missing}`);
  }
}
validateKeyDescriptions(AllKeyDescriptions);

export interface ISettingsAccessor {
  getSettingsFormData(categoryName: string): ISettingsSubCategory[];
  findSetting(
    settings: ISettingsSubCategory[],
    category: string,
    setting: string,
  ): TObsFormData[number] | undefined;
  findSettingValue(
    settings: ISettingsSubCategory[],
    category: string,
    setting: string,
  ): TObsValue | undefined;
  setSettings(categoryName: string, settingsData: ISettingsSubCategory[]): void;
}

/**
 * KeyDescription を通して設定値にアクセスする。
 */
export class SettingsKeyAccessor {
  private accessor: ISettingsAccessor;

  constructor(accessor: ISettingsAccessor) {
    this.accessor = accessor;
  }

  private categoryCache = new Map<CategoryName, ISettingsSubCategory[]>();
  private modifiedCategories = new Set<CategoryName>();

  private getCategory(category: CategoryName, reload: boolean = false): ISettingsSubCategory[] {
    if (reload || !this.categoryCache.has(category)) {
      console.log(`getCategory: ${category}`);
      this.categoryCache.set(category, this.accessor.getSettingsFormData(category));
    }
    return this.categoryCache.get(category);
  }

  private updateCategory(category: CategoryName) {
    if (this.categoryCache.has(category)) {
      console.log(`updateCategory: ${category}`);
      this.accessor.setSettings(category, this.getCategory(category));
    }
  }

  writeBackCategory(category: CategoryName) {
    if (this.modifiedCategories.has(category)) {
      this.updateCategory(category);
      this.modifiedCategories.delete(category);
    }
  }

  writeBackAllCategories() {
    for (const category of this.modifiedCategories) {
      this.updateCategory(category);
    }
    this.modifiedCategories.clear();
  }

  private forgetCategoryCache(category: CategoryName) {
    if (this.categoryCache.has(category)) {
      this.categoryCache.delete(category);
      if (this.modifiedCategories.has(category)) {
        this.modifiedCategories.delete(category);
      }
    }
  }

  clearCache() {
    this.writeBackAllCategories();
    this.categoryCache.clear();
  }

  /**
   * 実際の設定値を取得する
   */
  private findValue(i: KeyDescription): TObsValue {
    return this.accessor.findSettingValue(this.getCategory(i.category), i.subCategory, i.setting);
  }

  /**
   * 実際の設定値の選択肢を含む情報を取得する(更新時にもこれを使う)
   */
  private findSetting(i: KeyDescription): IObsInput<TObsValue> | IObsListInput<TObsValue> {
    return this.accessor.findSetting(this.getCategory(i.category), i.subCategory, i.setting);
  }

  /**
   * 値を1つ設定する
   */
  setValue(item: KeyDescription, value: TObsValue) {
    console.log(`setValue: ${item.category}/${item.key}: ${value}`);
    const setting = this.findSetting(item);
    if (setting) {
      if (setting.value !== value) {
        if (item.dependents) {
          // dependents は item の値に依存して出現したり消滅したりする。
          // 存在するときの修正は item 変更前に書き戻さないと反映されないため、事前に書き戻す。
          for (const dependent of item.dependents) {
            for (const subItem of dependent.params) {
              this.writeBackCategory(subItem.category);
            }
          }
        }
        console.log(`setValue: ${item.category}/${item.key}: ${setting.value} -> ${value}`);
        setting.value = value;
        const category = item.category;
        this.modifiedCategories.add(category);
        if (item.dependents) {
          // itemを変更すると、それに従って dependents全体が切り替わるため、
          // item自体の変更は即時で送信し、以後 dependentsを参照するときには読み直させるために
          // キャッシュを破棄する。(事前に上で変更は書き戻しているので単純破棄)
          // 変更後に破棄するのは、この破棄対象カテゴリがこのitem自身と同じケースがあるため。
          this.writeBackCategory(category);
          for (const dependent of item.dependents) {
            for (const subItem of dependent.params) {
              this.forgetCategoryCache(subItem.category);
            }
          }
        }
      }
    } else {
      console.warn(`key not found: ${item.key}`);
    }
  }

  /**
   * KeyDescriptions を再帰的に渡り歩いて f を呼び出す
   * @param keyDescriptions
   * @param f
   */
  *traverseKeyDescriptions<T>(
    keyDescriptions: KeyDescription[],
    f: (d: KeyDescription) => T,
  ): IterableIterator<T> {
    for (const item of keyDescriptions) {
      yield f(item);
      if (item.dependents) {
        const value = this.findValue(item);
        if (value) {
          for (const dependent of item.dependents) {
            if (dependent.values.includes(value)) {
              yield* this.traverseKeyDescriptions(dependent.params, f);
            }
          }
        }
      }
    }
  }

  *getValues(keyDescriptions: KeyDescription[]): IterableIterator<OptimizeSettings> {
    yield* this.traverseKeyDescriptions(
      keyDescriptions,
      (item: KeyDescription): OptimizeSettings => {
        /* DEBUG
        const setting = this.findSetting(item);
        if (setting && 'options' in setting && Array.isArray(setting.options)) {
            console.log(
                `${item.key}: availableOptions: `,
                JSON.stringify(setting.options.map((v: any) => v.value), null, 2)
            );
        } // */

        return { [item.key]: this.findValue(item) };
      },
    );
  }

  *getSettings(keyDescriptions: KeyDescription[]): IterableIterator<[OptimizationKey, any]> {
    yield* this.traverseKeyDescriptions(
      keyDescriptions,
      (item: KeyDescription): [OptimizationKey, any] => {
        const setting = this.findSetting(item);
        return [item.key, setting];
      },
    );
  }
  getSetting(key: OptimizationKey, keyDescriptions: KeyDescription[]): any {
    for (const kv of this.getSettings(keyDescriptions)) {
      if (kv[0] === key) {
        return kv[1];
      }
    }
    return undefined;
  }

  setValues(values: OptimizeSettings, keyDescriptions: KeyDescription[]) {
    for (const item of keyDescriptions) {
      const key = item.key;
      if (item.dependents) {
        let currentValue = this.findValue(item);
        for (const dependent of item.dependents) {
          if (isDependOnItems(values, dependent.params)) {
            this.setValue(item, dependent.values[0]);
            this.setValues(values, dependent.params);
          }
        }
        if (values.hasOwnProperty(key)) {
          currentValue = values[key];
        }
        this.setValue(item, currentValue);
      } else {
        if (values.hasOwnProperty(key)) {
          this.setValue(item, values[key]);
        }
      }
    }
  }

  /**
    // 指定した keyに指定した値が選択肢として現れるかを確認する
     * @param key
     * @param value
     * @param keyDescriptions
     */
  hasSpecificValue(
    key: OptimizationKey,
    value: any,
    keyDescriptions: KeyDescription[] = AllKeyDescriptions,
  ): boolean {
    const descriptions = filterKeyDescriptions(new Set([key]), keyDescriptions);
    const setting = this.getSetting(key, descriptions);
    if (setting && setting.hasOwnProperty('options') && Array.isArray(setting.options)) {
      const options: { value: any }[] = setting.options;
      return options.find(v => v.value === value) !== undefined;
    }
    return false;
  }
}

export class Optimizer {
  private accessor: SettingsKeyAccessor;
  private keyDescriptions: KeyDescription[];

  constructor(accessor: SettingsKeyAccessor, keysNeeded: Set<OptimizationKey> | OptimizeSettings) {
    this.accessor = accessor;
    this.keyDescriptions = filterKeyDescriptions(keysNeeded, AllKeyDescriptions);
  }

  getCurrentSettings(): OptimizeSettings {
    return Object.assign({}, ...this.accessor.getValues(this.keyDescriptions));
  }

  /**
   * 期待する前提 expect のうち、現在の値 current と異なる値を持つものだけを列挙する
   * @param current 現在の設定
   * @param expect 期待する設定
   */
  static *getDifference(
    current: OptimizeSettings,
    expect: OptimizeSettings,
  ): IterableIterator<OptimizeSettings> {
    // 最適化の必要な値を抽出する
    for (const key of Object.getOwnPropertyNames(expect)) {
      if (current[key] !== expect[key]) {
        yield { [key]: expect[key] };
      }
    }
  }

  /**
   * 現在値から expect に更新するための差分を列挙する
   * @param expect 期待する設定
   */
  *getDifferenceFromCurrent(expect: OptimizeSettings): IterableIterator<OptimizeSettings> {
    yield* Optimizer.getDifference(this.getCurrentSettings(), expect);
  }

  optimize(optimized: OptimizeSettings) {
    this.accessor.setValues(optimized, this.keyDescriptions);
    this.accessor.writeBackAllCategories();
  }

  optimizeInfo(
    current: OptimizeSettings,
    optimized: OptimizeSettings,
  ): [CategoryName, OptimizeItem[]][] {
    const map = new Map<CategoryName, OptimizeItem[]>();
    const merged = Object.assign({}, current, optimized);
    for (const keyDescription of iterateKeyDescriptions(merged, this.keyDescriptions)) {
      const opt = new OptKeyProperty(keyDescription);
      const key = opt.key;
      const category = opt.category;
      let item;
      if (optimized.hasOwnProperty(key)) {
        item = {
          key,
          name: opt.label,
          currentValue: opt.value(current[key]),
          newValue: opt.value(optimized[key]),
        };
      } else {
        item = {
          key,
          name: opt.label,
          currentValue: opt.value(current[key]),
        };
      }

      if (!map.has(category)) {
        map.set(category, [item]);
      } else {
        map.get(category).push(item);
      }
    }
    return Array.from(map);
  }
}
