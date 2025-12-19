import {
  ISourceApi,
  TSourceType,
  ISource,
  SourcesService,
  TPropertiesManager,
  ISourceComparison,
  PROPERTIES_MANAGER_TYPES,
} from './index';
import { mutation, ServiceHelper, Inject, ExecuteInWorkerProcess } from 'services';
import { ScenesService } from 'services/scenes';
import { TObsFormData } from 'components/obs/inputs/ObsInput';
import Utils from 'services/utils';
import * as obs from '../../../obs-api';
import isEqual from 'lodash/isEqual';
import omitBy from 'lodash/omitBy';
import omit from 'lodash/omit';
import { assertIsDefined } from '../../util/properties-type-guards';
import { SourceFiltersService } from '../source-filters';
import { TransitionsService } from 'services/transitions';
import { byOS, OS } from 'util/operating-systems';

@ServiceHelper('SourcesService')
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
  configurable: boolean;
  doNotDuplicate: boolean;
  forceUiRefresh: boolean;
  channel?: number;
  resourceId: string;
  propertiesManagerType: TPropertiesManager;
  propertiesManagerSettings: Dictionary<any>;
  forceHidden: boolean;
  forceMuted: boolean;
  deinterlaceMode: obs.EDeinterlaceMode;
  deinterlaceFieldOrder: obs.EDeinterlaceFieldOrder;

  state: ISource;

  @Inject() private scenesService: ScenesService;
  @Inject() private sourceFiltersService: SourceFiltersService;
  @Inject() private transitionsService: TransitionsService;

  /**
   * Should only be called by functions with the ExecuteInWorkerProcess() decorator
   */
  getObsInput(): obs.IInput {
    return obs.InputFactory.fromName(this.sourceId);
  }

  getModel() {
    return this.state;
  }

  // TODO: propertiesMangers should be private
  @ExecuteInWorkerProcess()
  updateSettings(settings: Dictionary<any>) {
    this.getObsInput().update(settings);
    this.sourcesService.propertiesManagers[this.sourceId].manager.handleSettingsChange(settings);
    this.sourcesService.sourceUpdated.next(this.state);
  }

  @ExecuteInWorkerProcess()
  getSettings(): Dictionary<any> {
    return this.getObsInput().settings;
  }

  @ExecuteInWorkerProcess()
  setForceHidden(val: boolean) {
    this.SET_FORCE_HIDDEN(val);

    // This is probably not great separation of concerns, but
    // is a side effect of needing forceHidden to be a property
    // on the source, whereas visibility is controlled by scene-item.
    // Anyway, we need to find all scene items referencing this source
    // and force hide/show them.
    this.scenesService.views.getSceneItemsBySourceId(this.sourceId).forEach(sceneItem => {
      if (val) {
        // Force hide everything without touching UI state
        sceneItem.getObsSceneItem().visible = false;
      } else {
        // Return everything to the state in the UI
        sceneItem.getObsSceneItem().visible = sceneItem.visible;
      }
    });
  }

  @ExecuteInWorkerProcess()
  setForceMuted(val: boolean) {
    this.SET_FORCE_MUTED(val);

    this.getObsInput().muted = val ? true : this.muted;
  }

  /**
   * Compares the details of this source to another, to determine
   * whether adding as a reference makes sense.
   * @param comparison the comparison details of the other source
   */
  isSameType(comparison: ISourceComparison): boolean {
    if (this.channel) return false;

    return isEqual(
      omitBy(this.getComparisonDetails(), v => v == null),
      omitBy(comparison, v => v == null),
    );
  }

  getComparisonDetails(): ISourceComparison {
    const details: ISourceComparison = {
      type: this.type,
      propertiesManager: this.getPropertiesManagerType(),
    };
    if (this.getPropertiesManagerType() === 'streamlabels') {
      details.isStreamlabel = true;
    }

    if (this.getPropertiesManagerType() === 'widget') {
      details.widgetType = this.getPropertiesManagerSettings().widgetType;
    }

    if (this.getPropertiesManagerType() === 'platformApp') {
      details.appId = this.getPropertiesManagerSettings().appId;
      details.appSourceId = this.getPropertiesManagerSettings().appSourceId;
    }

    return details;
  }

  getPropertiesManagerType(): TPropertiesManager {
    return this.propertiesManagerType;
  }

  getPropertiesManagerSettings(): Dictionary<any> {
    return this.propertiesManagerSettings;
  }

  // TODO: propertiesMangers should be private
  @ExecuteInWorkerProcess()
  getPropertiesManagerUI(): string {
    return this.sourcesService.propertiesManagers[this.sourceId].manager.customUIComponent;
  }

  /**
   * Replaces the current properties manager on a source
   * @param type the type of the new properties manager
   * @param settings the properties manager settings
   */
  // TODO: propertiesMangers should be private
  @ExecuteInWorkerProcess()
  replacePropertiesManager(type: TPropertiesManager, settings: Dictionary<any>) {
    const oldManager = this.sourcesService.propertiesManagers[this.sourceId].manager;
    oldManager.destroy();

    const managerKlass = PROPERTIES_MANAGER_TYPES[type];
    this.sourcesService.propertiesManagers[this.sourceId].manager = new managerKlass(
      this.getObsInput(),
      settings,
      this.sourceId,
    );
    this.sourcesService.propertiesManagers[this.sourceId].type = type;
    this.SET_PROPERTIES_MANAGER_TYPE(type);
    this.sourcesService.sourceUpdated.next(this.getModel());
  }

  // TODO: propertiesMangers should be private
  @ExecuteInWorkerProcess()
  setPropertiesManagerSettings(settings: Dictionary<any>) {
    this.sourcesService.propertiesManagers[this.sourceId].manager.applySettings(settings);
  }

  // TODO: propertiesMangers should be private
  @ExecuteInWorkerProcess()
  getPropertiesFormData(): TObsFormData {
    const manager = this.sourcesService.propertiesManagers[this.sourceId].manager;
    return manager.getPropertiesFormData();
  }

  // TODO: propertiesMangers should be private
  @ExecuteInWorkerProcess()
  setPropertiesFormData(properties: TObsFormData) {
    const manager = this.sourcesService.propertiesManagers[this.sourceId].manager;
    manager.setPropertiesFormData(properties);
    this.sourcesService.sourceUpdated.next(this.state);

    // In studio mode if user sets path to newly created source, we need to start playback manually,
    // because source in studio mode is not active.
    if (this.transitionsService.state.studioMode && properties.length === 1) {
      const settings = properties.at(0);
      if (settings?.enabled && settings?.name === 'local_file' && this.type === 'ffmpeg_source') {
        this.getObsInput().play();
      }
    }
  }

  duplicate(newSourceId?: string): Source | null {
    if (this.doNotDuplicate) return null;

    // create a new source
    const newSource = this.sourcesService.createSource(this.name, this.type, this.getSettings(), {
      sourceId: newSourceId,
      propertiesManager: this.getPropertiesManagerType(),
      // Media backup settings are considered per-source and should not be
      // copied to new sources.
      propertiesManagerSettings: omit(this.getPropertiesManagerSettings(), 'mediaBackup'),
    });

    // copy filters
    this.sourceFiltersService.getFilters(this.sourceId).forEach(filter => {
      this.sourceFiltersService.add(newSource.sourceId, filter.type, filter.name, filter.settings);
    });

    return newSource;
  }

  remove() {
    this.sourcesService.removeSource(this.sourceId);
  }

  setName(newName: string) {
    this.SET_NAME(newName);
    this.sourcesService.sourceUpdated.next(this.state);
  }

  hasProps(): boolean {
    return this.configurable;
  }

  // Remap keycodes for keys that are independent of keyboard layout
  getMacVirtualKeyCode(code: number) {
    // The lookup map contains problematic keys that needs to be remapped into a CGKeyCode.
    const keyMap: Record<number, { vkey: number; text?: string }> = {
      8: { text: '', vkey: 51 }, // backspace
      9: { text: '', vkey: 48 }, // TAB
      45: { text: '', vkey: 114 }, // insert
      46: { text: '', vkey: 117 }, // delete
      37: { text: '', vkey: 123 }, // left arrow
      39: { text: '', vkey: 124 }, // right arrow
      38: { text: '', vkey: 126 }, // up arrow
      40: { text: '', vkey: 125 }, // down arrow
      36: { text: '', vkey: 115 }, // Home
      13: { text: '', vkey: 36 }, // Return
      35: { text: '', vkey: 119 }, // End
      33: { text: '', vkey: 116 }, // Page Up
      34: { text: '', vkey: 121 }, // Page Down
      27: { text: '', vkey: 53 }, // Escape
      32: { vkey: 49 }, // Space
      112: { text: '', vkey: 122 }, // F1
      113: { text: '', vkey: 120 }, // F2
      114: { text: '', vkey: 99 }, // F3
      115: { text: '', vkey: 118 }, // F4
      116: { text: '', vkey: 96 }, // F5
      117: { text: '', vkey: 97 }, // F6
      118: { text: '', vkey: 98 }, // F7
      119: { text: '', vkey: 100 }, // F8
      120: { text: '', vkey: 101 }, // F9
      121: { text: '', vkey: 109 }, // F10
      122: { text: '', vkey: 103 }, // F11
      123: { text: '', vkey: 111 }, // F12
      124: { text: '', vkey: 105 }, // Map Print Screen → F13
      // Number keys 0–9
      48: { vkey: 29 }, // 0
      49: { vkey: 18 }, // 1
      50: { vkey: 19 }, // 2
      51: { vkey: 20 }, // 3
      52: { vkey: 21 }, // 4
      53: { vkey: 23 }, // 5
      54: { vkey: 22 }, // 6
      55: { vkey: 26 }, // 7
      56: { vkey: 28 }, // 8
      57: { vkey: 25 }, // 9
      76: { vkey: 37 }, // L key
    };
    return keyMap[code];
  }

  /**
   * works only for browser_source
   */
  @ExecuteInWorkerProcess()
  refresh() {
    const obsInput = this.getObsInput();
    (obsInput.properties.get('refreshnocache') as obs.IButtonProperty).buttonClicked(obsInput);
  }

  /**
   * Used for browser source interaction
   * @param pos the cursor position in source space
   */
  @ExecuteInWorkerProcess()
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
  @ExecuteInWorkerProcess()
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

  @ExecuteInWorkerProcess()
  setDeinterlaceMode(mode: obs.EDeinterlaceMode) {
    this.SET_DEINTERLACE_MODE(mode);

    this.getObsInput().deinterlaceMode = mode;
  }

  @ExecuteInWorkerProcess()
  setDeinterlaceFieldOrder(order: obs.EDeinterlaceFieldOrder) {
    this.SET_DEINTERLACE_FIELD_ORDER(order);

    this.getObsInput().deinterlaceFieldOrder = order;
  }

  /**
   * Used for browser source interaction
   * @param pos the cursor position in source space
   * @param delta the amount the wheel was scrolled
   */
  @ExecuteInWorkerProcess()
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
  @ExecuteInWorkerProcess()
  keyInput(
    key: string,
    code: number,
    keyup: boolean,
    modifiers: { alt: boolean; ctrl: boolean; shift: boolean },
  ) {
    let normalizedText = key;
    let nativeVkey = code;
    let ignoreKeypress = false;

    byOS({
      [OS.Windows]: () => {
        // Enter key
        if (code === 13) normalizedText = '\r';
      },
      [OS.Mac]: () => {
        const entry = this.getMacVirtualKeyCode(code);
        if (entry) {
          if (keyup) {
            ignoreKeypress = true; // These special keys are handled for both keyup & keydown resulting in two key presses.
          } else {
            normalizedText = entry.text ?? key;
            nativeVkey = entry.vkey;
          }
        }
      },
    });

    if (!ignoreKeypress) {
      const altKey: number = (modifiers.alt && obs.EInteractionFlags.AltKey) || 0;
      const ctrlKey: number = (modifiers.ctrl && obs.EInteractionFlags.ControlKey) || 0;
      const shiftKey: number = (modifiers.shift && obs.EInteractionFlags.ShiftKey) || 0;
      this.getObsInput().sendKeyClick(
        {
          modifiers: altKey | ctrlKey | shiftKey,
          text: normalizedText,
          nativeModifiers: 0,
          nativeScancode: 0,
          nativeVkey,
        },
        keyup,
      );
    }
  }

  @ExecuteInWorkerProcess()
  sendFocus(focus: boolean) {
    this.getObsInput().sendFocus(focus);
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

  isDestroyed(): boolean {
    return (
      !this.sourcesService.state.sources[this.sourceId] &&
      !this.sourcesService.state.temporarySources[this.sourceId]
    );
  }

  @mutation()
  private SET_FORCE_HIDDEN(val: boolean) {
    this.state.forceHidden = val;
  }

  @mutation()
  private SET_FORCE_MUTED(val: boolean) {
    this.state.forceMuted = val;
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
  private SET_DEINTERLACE_MODE(val: obs.EDeinterlaceMode) {
    this.state.deinterlaceMode = val;
  }

  @mutation()
  private SET_DEINTERLACE_FIELD_ORDER(val: obs.EDeinterlaceFieldOrder) {
    this.state.deinterlaceFieldOrder = val;
  }
}
