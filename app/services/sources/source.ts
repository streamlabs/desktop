import { TObsFormData } from 'components/obs/inputs/ObsInput';
import { cloneDeep, isEqual } from 'lodash';
import { ScenesService } from 'services/scenes';
import Utils from 'services/utils';
import { assertIsDefined } from 'util/properties-type-guards';
import * as obs from '../../../obs-api';
import { Inject, mutation, ServiceHelper } from '../core';
import {
  ISource,
  ISourceApi,
  ISourceComparison,
  PROPERTIES_MANAGER_TYPES,
  SourcesService,
  TPropertiesManager,
  TSourceType,
} from './index';

@ServiceHelper()
export class Source implements ISourceApi {
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
  channel?: number;
  deinterlaceMode: obs.EDeinterlaceMode;
  deinterlaceFieldOrder: obs.EDeinterlaceFieldOrder;
  resourceId: string;
  propertiesManagerType: TPropertiesManager;

  state: ISource;

  @Inject()
  scenesService: ScenesService;

  getObsInput(): obs.IInput {
    return obs.InputFactory.fromName(this.sourceId);
  }

  getModel() {
    return this.state;
  }

  updateSettings(settings: Dictionary<any>) {
    const obsInputSettings = this.sourcesService.getObsSourceSettings(this.type, settings);
    this.getObsInput().update(obsInputSettings);
    this.sourcesService.sourceUpdated.next(this.state);
  }

  getSettings(): Dictionary<any> {
    return this.getObsInput().settings;
  }

  /**
   * Compares the details of this source to another, to determine
   * whether adding as a reference makes sense.
   * @param comparison the comparison details of the other source
   */
  isSameType(comparison: ISourceComparison): boolean {
    if (this.channel) return false;

    return isEqual(this.getComparisonDetails(), comparison);
  }

  getComparisonDetails(): ISourceComparison {
    const details: ISourceComparison = {
      type: this.type,
      propertiesManager: this.getPropertiesManagerType(),
    };

    if (this.getPropertiesManagerType() === 'nvoice-character') {
      details.nVoiceCharacterType = this.getPropertiesManagerSettings().nVoiceCharacterType;
    }

    return details;
  }

  getPropertiesManagerType(): TPropertiesManager {
    return this.propertiesManagerType;
  }

  getPropertiesManagerSettings(): Dictionary<any> {
    return cloneDeep(this.sourcesService.propertiesManagers[this.sourceId].manager.settings);
  }

  getPropertiesManagerUI(): string {
    return this.sourcesService.propertiesManagers[this.sourceId].manager.customUIComponent;
  }

  /**
   * Replaces the current properties manager on a source
   * @param type the type of the new properties manager
   * @param settings the properties manager settings
   */
  replacePropertiesManager(type: TPropertiesManager, settings: Dictionary<any>) {
    const oldManager = this.sourcesService.propertiesManagers[this.sourceId].manager;
    oldManager.destroy();

    const managerKlass = PROPERTIES_MANAGER_TYPES[type];
    this.sourcesService.propertiesManagers[this.sourceId].manager = new managerKlass(
      this.getObsInput(),
      settings,
    );
    this.sourcesService.propertiesManagers[this.sourceId].type = type;
    this.SET_PROPERTIES_MANAGER_TYPE(type);
    this.sourcesService.sourceUpdated.next(this.getModel());
  }

  setPropertiesManagerSettings(settings: Dictionary<any>) {
    this.sourcesService.propertiesManagers[this.sourceId].manager.applySettings(settings);
  }

  getPropertiesFormData(): TObsFormData {
    const manager = this.sourcesService.propertiesManagers[this.sourceId].manager;
    return manager.getPropertiesFormData();
  }

  setPropertiesFormData(properties: TObsFormData) {
    const manager = this.sourcesService.propertiesManagers[this.sourceId].manager;
    manager.setPropertiesFormData(properties);
    this.sourcesService.sourceUpdated.next(this.state);
  }

  duplicate(newSourceId?: string): Source {
    if (this.doNotDuplicate) return null;
    return this.sourcesService.createSource(this.name, this.type, this.getSettings(), {
      sourceId: newSourceId,
      propertiesManager: this.getPropertiesManagerType(),
      propertiesManagerSettings: this.getPropertiesManagerSettings(),
    });
  }

  remove() {
    this.sourcesService.removeSource(this.sourceId);
  }

  setName(newName: string) {
    this.SET_NAME(newName);
    this.sourcesService.sourceUpdated.next(this.state);
  }

  setDeinterlaceMode(newMode: obs.EDeinterlaceMode) {
    this.getObsInput().deinterlaceMode = newMode;
    this.SET_DEINTERLACE_MODE(newMode);
    this.sourcesService.sourceUpdated.next(this.state);
  }

  setDeinterlaceFieldOrder(newOrder: obs.EDeinterlaceFieldOrder) {
    this.getObsInput().deinterlaceFieldOrder = newOrder;
    this.SET_DEINTERLACE_FIELD_ORDER(newOrder);
    this.sourcesService.sourceUpdated.next(this.state);
  }

  hasProps(): boolean {
    return this.getObsInput().configurable;
  }

  /**
   * works only for browser_source
   */
  refresh() {
    const obsInput = this.getObsInput();
    (obsInput.properties.get('refreshnocache') as obs.IButtonProperty).buttonClicked(obsInput);
  }

  /**
   * Used for browser source interaction
   * @param pos the cursor position in source space
   */
  //@ExecuteInWorkerProcess()
  mouseMove(pos: IVec2) {
    this.getObsInput().sendMouseMove(
      {
        modifiers: 0,
        x: Math.floor(pos.x),
        y: Math.floor(pos.y),
      },
      false,
    );
  }

  /**
   * Used for browser source interaction
   * @param button the JS event button number
   * @param pos the cursor position in source space
   * @param mouseUp whether this is a mouseup (false for mousedown)
   */
  //@ExecuteInWorkerProcess()
  mouseClick(button: number, pos: IVec2, mouseUp: boolean) {
    let obsFlags: obs.EInteractionFlags;
    let obsButton: obs.EMouseButtonType;

    if (button === 0) {
      obsFlags = obs.EInteractionFlags.MouseLeft;
      obsButton = obs.EMouseButtonType.Left;
    } else if (button === 1) {
      obsFlags = obs.EInteractionFlags.MouseMiddle;
      obsButton = obs.EMouseButtonType.Middle;
    } else if (button === 2) {
      obsFlags = obs.EInteractionFlags.MouseRight;
      obsButton = obs.EMouseButtonType.Right;
    } else {
      // Other button types are not supported
      return;
    }

    this.getObsInput().sendMouseClick(
      {
        modifiers: obsFlags,
        x: Math.floor(pos.x),
        y: Math.floor(pos.y),
      },
      obsButton,
      mouseUp,
      1,
    );
  }

  /**
   * Used for browser source interaction
   * @param pos the cursor position in source space
   * @param delta the amount the wheel was scrolled
   */
  //@ExecuteInWorkerProcess()
  mouseWheel(pos: IVec2, delta: IVec2) {
    console.log(pos, delta);

    this.getObsInput().sendMouseWheel(
      {
        modifiers: obs.EInteractionFlags.None,
        x: Math.floor(pos.x),
        y: Math.floor(pos.y),
      },
      0, // X scrolling is currently unsupported
      Math.floor(delta.y) * -1,
    );
  }

  /**
   * Used for browser source interaction
   * @param key The string representation of the key
   * @param code The numberical key code
   * @param keyup whether this is a keyup (false for keydown)
   * @param modifiers an object representing which modifiers were pressed
   */
  //@ExecuteInWorkerProcess()
  keyInput(
    key: string,
    code: number,
    keyup: boolean,
    modifiers: { alt: boolean; ctrl: boolean; shift: boolean },
  ) {
    let normalizedText = key;

    // Enter key
    if (code === 13) normalizedText = '\r';

    const altKey: number = (modifiers.alt && obs.EInteractionFlags.AltKey) || 0;
    const ctrlKey: number = (modifiers.ctrl && obs.EInteractionFlags.ControlKey) || 0;
    const shiftKey: number = (modifiers.shift && obs.EInteractionFlags.ShiftKey) || 0;
    this.getObsInput().sendKeyClick(
      {
        modifiers: altKey | ctrlKey | shiftKey,
        text: normalizedText,
        nativeModifiers: 0,
        nativeScancode: 0,
        nativeVkey: code,
      },
      keyup,
    );
  }

  @Inject()
  protected sourcesService: SourcesService;

  constructor(sourceId: string) {
    // Using a proxy will ensure that this object
    // is always up-to-date, and essentially acts
    // as a view into the store.  It also enforces
    // the read-only nature of this data
    const state =
      this.sourcesService.state.sources[sourceId] ||
      this.sourcesService.state.temporarySources[sourceId];
    assertIsDefined(state);
    Utils.applyProxy(this, state);
    this.state = state;
  }

  @mutation()
  private SET_NAME(newName: string) {
    this.state.name = newName;
  }

  @mutation()
  private SET_PROPERTIES_MANAGER_TYPE(type: TPropertiesManager) {
    this.state.propertiesManagerType = type;
  }

  @mutation()
  private SET_DEINTERLACE_MODE(newMode: obs.EDeinterlaceMode) {
    this.state.deinterlaceMode = newMode;
  }

  @mutation()
  private SET_DEINTERLACE_FIELD_ORDER(newOrder: obs.EDeinterlaceFieldOrder) {
    this.state.deinterlaceFieldOrder = newOrder;
  }
}
