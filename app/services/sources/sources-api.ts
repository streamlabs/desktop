import { IPropertyManager } from './properties-managers/properties-manager';
import { IObsListOption, TObsFormData } from 'components/obs/inputs/ObsInput';
import { Observable } from 'rxjs';
import { IAudioSource } from '../audio';
import * as obs from '../../../obs-api';
import { NVoiceCharacterType } from 'services/nvoice-character';
import { IPartialTransform } from 'services/scenes';

export interface ISource extends IResource {
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
  propertiesManagerType: TPropertiesManager;
  channel?: number;
  deinterlaceMode: obs.EDeinterlaceMode;
  deinterlaceFieldOrder: obs.EDeinterlaceFieldOrder;
}

/**
 * Used to compare whether 2 sources are functionally
 * equivalent and should be created as a reference.
 */
export interface ISourceComparison {
  type: TSourceType;
  propertiesManager: TPropertiesManager;
  nVoiceCharacterType?: NVoiceCharacterType;
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
  setDeinterlaceMode(newMode: obs.EDeinterlaceMode): void;
  setDeinterlaceFieldOrder(newOrder: obs.EDeinterlaceFieldOrder): void;
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
  getSource(sourceId: string): ISourceApi;
  getSourcesByName(name: string): ISourceApi[];

  /**
   * creates a source from a file
   * source type depends on the file extension
   */
  addFile(path: string): ISourceApi;
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
  propertiesManagerSettings?: Dictionary<any>;
  audioSettings?: Partial<IAudioSource>;
  isTemporary?: boolean;
  initialTransform?: IPartialTransform;
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
  | 'liv_capture'
  | 'ovrstream_dc_source'
  | 'vlc_source'
  | 'wasapi_process_output_capture'
  | 'custom_cast_ndi_source'
  | 'custom_cast_ndi_guide'
  | 'nair-rtvc-source';

// Register new properties manager here
export type TPropertiesManager = 'default' | 'nvoice-character' | 'custom-cast-ndi';

export function isNoAudioPropertiesManagerType(propertiesManagerType: TPropertiesManager): boolean {
  return ['nvoice-character'].includes(propertiesManagerType);
}

export interface ISourcesState {
  sources: Dictionary<ISource>;
  temporarySources: Dictionary<ISource>;
}

export interface IActivePropertyManager {
  manager: IPropertyManager;
  type: TPropertiesManager;
}
