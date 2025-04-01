import { IPropertyManager } from './properties-managers/properties-manager';
import { IObsListOption, TObsFormData } from 'components/obs/inputs/ObsInput';
import { WidgetType } from 'services/widgets';
import { Observable } from 'rxjs';
import { IAudioSource } from 'services/audio';
import { EDeinterlaceFieldOrder, EDeinterlaceMode } from 'obs-studio-node';
import { TDisplayType } from 'services/settings-v2';

export interface ISource {
  sourceId: string;
  name: string;
  type: TSourceType;
  audio: boolean;
  video: boolean;
  async: boolean;
  muted: boolean;
  width: number;
  height: number;
  doNotDuplicate: boolean;
  configurable: boolean;
  forceUiRefresh: boolean;
  propertiesManagerType: TPropertiesManager;
  propertiesManagerSettings?: Dictionary<any>;
  channel?: number;
  /**
   * When set to true, all scene items referencing this source
   * will automatically be hidden, regardless of whether they
   * are set to visible in the UI.
   *
   * This is mainly meant to support Guest Cam
   */
  forceHidden: boolean;
  /**
   * When set to true, this source will not ouptut any audio,
   * irrespective of what the user-set muted option displays.
   *
   * This is mainly meant to support Guest Cam
   */
  forceMuted: boolean;
  deinterlaceMode?: EDeinterlaceMode;
  deinterlaceFieldOrder?: EDeinterlaceFieldOrder;
}

/**
 * Used to compare whether 2 sources are functionally
 * equivalent and should be created as a reference.
 */
export interface ISourceComparison {
  type: TSourceType;
  propertiesManager: TPropertiesManager;
  widgetType?: WidgetType;
  isStreamlabel?: boolean;
  appId?: string;
  appSourceId?: string;
}

export interface ISourceApi extends ISource {
  updateSettings(settings: Dictionary<any>): void;
  getSettings(): Dictionary<any>;
  isSameType(comparison: ISourceComparison): boolean;
  getPropertiesManagerType(): TPropertiesManager;
  getPropertiesManagerSettings(): Dictionary<any>;
  getPropertiesManagerUI(): string;
  getPropertiesFormData(): TObsFormData;
  setPropertiesFormData(properties: TObsFormData): void;
  setPropertiesManagerSettings(settings: Dictionary<any>): void;
  hasProps(): boolean;
  setName(newName: string): void;
  refresh(): void;
}

export interface ISourcesServiceApi {
  createSource(
    name: string,
    type: TSourceType,
    settings?: Dictionary<any>,
    options?: ISourceAddOptions,
  ): ISourceApi;
  removeSource(id: string): void;
  getAvailableSourcesTypes(): TSourceType[];
  getAvailableSourcesTypesList(): IObsListOption<TSourceType>[];
  getSources(): ISourceApi[];
  getSource(sourceId: string): ISourceApi | null;
  getSourcesByName(name: string): (ISourceApi | null)[];

  /**
   * creates a source from a file
   * source type depends on the file extension
   */
  addFile(path: string): ISourceApi | null;
  suggestName(name: string): string;
  showSourceProperties(sourceId: string): void;
  showShowcase(): void;
  showAddSource(sourceType: TSourceType): void;
  sourceAdded: Observable<ISource>;
  sourceUpdated: Observable<ISource>;
  sourceRemoved: Observable<ISource>;
}

export interface ISourceAddOptions<TPropertiesManagerSettings = Dictionary<any>> {
  channel?: number;
  sourceId?: string; // A new ID will be generated if one is not specified
  propertiesManager?: TPropertiesManager;
  propertiesManagerSettings?: TPropertiesManagerSettings;
  audioSettings?: Partial<IAudioSource>;
  isTemporary?: boolean;
  guestCamStreamId?: string; // Automatically assign a guest to this source after creation
  deinterlaceMode?: EDeinterlaceMode;
  deinterlaceFieldOrder?: EDeinterlaceFieldOrder;
  display?: TDisplayType;
}

export type TSourceType =
  | 'image_source'
  | 'color_source'
  | 'browser_source'
  | 'slideshow'
  | 'ffmpeg_source'
  | 'text_gdiplus'
  | 'text_ft2_source'
  | 'monitor_capture'
  | 'window_capture'
  | 'game_capture'
  | 'dshow_input'
  | 'wasapi_input_capture'
  | 'wasapi_output_capture'
  | 'decklink-input'
  | 'scene'
  | 'ndi_source'
  | 'openvr_capture'
  | 'screen_capture'
  | 'mac_screen_capture'
  | 'liv_capture'
  | 'ovrstream_dc_source'
  | 'vlc_source'
  | 'coreaudio_input_capture'
  | 'coreaudio_output_capture'
  | 'av_capture_input'
  | 'display_capture'
  | 'audio_line'
  | 'syphon-input'
  | 'soundtrack_source'
  | 'mediasoupconnector'
  | 'wasapi_process_output_capture'
  | 'spout_capture';

// Register new properties managers here
export type TPropertiesManager =
  | 'default'
  | 'widget'
  | 'streamlabels'
  | 'platformApp'
  | 'replay'
  | 'iconLibrary';

export interface ISourcesState {
  sources: Dictionary<ISource>;
  temporarySources: Dictionary<ISource>;
}

export interface IActivePropertyManager {
  manager: IPropertyManager;
  type: TPropertiesManager;
}

export interface ISourceDisplayData {
  name: string;
  description: string;
  demoFilename?: string;
  supportList?: string[];
  demoVideo?: boolean;
  icon: string;
  shortDesc?: string;
  link?: string;
  linkText?: string;
  // TODO: make required if none are missing
  group?: string;
}
