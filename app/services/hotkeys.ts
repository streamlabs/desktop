import { StreamingService } from 'services/streaming';
import { ScenesService } from 'services/scenes';
import { SourcesService, TSourceType } from 'services/sources';
import { TransitionsService } from 'services/transitions';
import { KeyListenerService } from 'services/key-listener';
import { MarkersService } from 'services/markers';
import { Inject } from 'services/core/injector';
import { StatefulService, mutation, ServiceHelper } from 'services';
import defer from 'lodash/defer';
import mapValues from 'lodash/mapValues';
import { $t } from 'services/i18n';
import * as obs from '../../obs-api';
import { GameOverlayService } from './game-overlay';
import { CustomizationService } from './customization';
import { RecentEventsService } from './recent-events';
import { UsageStatisticsService } from './usage-statistics';
import { getOS, OS } from 'util/operating-systems';
import { TDisplayType } from './settings-v2';
import { VirtualWebcamService } from 'app-services';

function getScenesService(): ScenesService {
  return ScenesService.instance;
}

function getSourcesService(): SourcesService {
  return SourcesService.instance;
}

function getStreamingService(): StreamingService {
  return StreamingService.instance;
}

function getTransitionsService(): TransitionsService {
  return TransitionsService.instance;
}

function getGameOverlayService(): GameOverlayService {
  return GameOverlayService.instance;
}

function getCustomizationService(): CustomizationService {
  return CustomizationService.instance;
}

function getRecentEventsService(): RecentEventsService {
  return RecentEventsService.instance;
}

function getVirtualCameraService(): VirtualWebcamService {
  return VirtualWebcamService.instance;
}

function getMarkersService(): MarkersService {
  return MarkersService.instance;
}

const isAudio = (sourceId: string) => {
  const source = getSourcesService().views.getSource(sourceId);

  return source ? source.audio : false;
};

const isSourceType = (type: TSourceType) => (sourceId: string) => {
  const source = getSourcesService().views.getSource(sourceId);

  return source ? source.type === type : false;
};

function getHotkeyHash(hotkey: IHotkey): string {
  return `${hotkey.actionName}/${hotkey.sceneId || ''}${hotkey.sourceId || ''}/${
    hotkey.sceneItemId || ''
  }`;
}

/**
 * Process a hotkey by sending it directly to OBS backend
 *
 * @param isKeyDown Whether the key was pressed or released
 */
const processObsHotkey = (isKeyDown: boolean) => (itemId: string, hotkeyId: number): void => {
  obs.NodeObs.OBS_API_ProcessHotkeyStatus(hotkeyId, isKeyDown);
};

type THotkeyType = 'GENERAL' | 'SCENE' | 'SCENE_ITEM' | 'SOURCE' | 'MARKER';

/**
 * Represents the key bound to a hotkey action
 */
export interface IBinding {
  key: string; // Is key code
  modifiers: {
    alt: boolean;
    ctrl: boolean;
    shift: boolean;
    meta: boolean;
  };
}

interface IHotkeyAction {
  name: string;
  description(entityId: string): string;

  down(entityId: string, hotkeyId?: number): void;

  isActive?(entityId: string): boolean;
  shouldApply?(entityId: string): boolean;

  up?(entityId: string, hotkeyId?: number): void;

  // These are injected dynamically
  downHandler?(): void;
  upHandler?(): void;
}

type HotkeyGroup = {
  [actionName: string]: IHotkeyAction;
};

const GENERAL_ACTIONS: HotkeyGroup = {
  TOGGLE_START_STREAMING: {
    name: 'TOGGLE_START_STREAMING',
    description: () => $t('Start Streaming'),
    down: () => getStreamingService().toggleStreaming(),
    isActive: () => {
      const streamingService = getStreamingService();
      return streamingService.isStreaming;
    },
  },
  TOGGLE_STOP_STREAMING: {
    name: 'TOGGLE_STOP_STREAMING',
    description: () => $t('Stop Streaming'),
    down: () => {
      const streamingService = getStreamingService();
      streamingService.toggleStreaming();
    },
    isActive: () => {
      const streamingService = getStreamingService();
      return !streamingService.isStreaming;
    },
  },
  TOGGLE_START_RECORDING: {
    name: 'TOGGLE_START_RECORDING',
    description: () => $t('Start Recording'),
    down: () => getStreamingService().toggleRecording(),
    isActive: () => getStreamingService().isRecording,
  },
  TOGGLE_STOP_RECORDING: {
    name: 'TOGGLE_STOP_RECORDING',
    description: () => $t('Stop Recording'),
    down: () => getStreamingService().toggleRecording(),
    isActive: () => !getStreamingService().isRecording,
  },
  ENABLE_STUDIO_MODE: {
    name: 'ENABLE_STUDIO_MODE',
    description: () => $t('Enable Studio Mode'),
    down: () => getTransitionsService().enableStudioMode(),
    isActive: () => getTransitionsService().state.studioMode,
  },
  DISABLE_STUDIO_MODE: {
    name: 'DISABLE_STUDIO_MODE',
    description: () => $t('Disable Studio Mode'),
    down: () => getTransitionsService().disableStudioMode(),
    isActive: () => !getTransitionsService().state.studioMode,
  },
  TRANSITION_STUDIO_MODE: {
    name: 'TRANSITION_STUDIO_MODE',
    description: () => $t('Transition (Studio Mode)'),
    down: () => getTransitionsService().executeStudioModeTransition(),
  },
  SAVE_REPLAY: {
    name: 'SAVE_REPLAY',
    description: () => $t('Save Replay'),
    down: () => getStreamingService().saveReplay(),
  },
  SPLIT_FILE: {
    name: 'SPLIT_FILE',
    description: () => $t('Split Recording File'),
    down: () => getStreamingService().splitFile(),
  },
  TOGGLE_OVERLAY: {
    name: 'TOGGLE_OVERLAY',
    description: () => $t('Toggle in-game overlay'),
    down: () => getGameOverlayService().toggleOverlay(),
    shouldApply: () => getOS() === OS.Windows,
  },
  TOGGLE_OVERLAY_POSITIONING: {
    name: 'TOGGLE_OVERLAY_POSITIONING',
    description: () => $t('Toggle overlay positioning mode'),
    down: () => getGameOverlayService().setPreviewMode(!getGameOverlayService().state.previewMode),
    shouldApply: () => getOS() === OS.Windows,
  },
  TOGGLE_PERFORMANCE_MODE: {
    name: 'TOGGLE_PERFORMANCE_MODE',
    description: () => $t('Toggle Performance Mode'),
    down: () => getCustomizationService().togglePerformanceMode(),
  },
  SKIP_ALERT: {
    name: 'SKIP_ALERT',
    description: () => $t('Skip Alert'),
    down: () => getRecentEventsService().skipAlert(),
  },
  TOGGLE_VIRTUAL_CAMERA_ON: {
    name: 'TOGGLE_VIRTUAL_CAMERA_ON',
    description: () => $t('Start Virtual Camera'),
    down: () => getVirtualCameraService().start(),
    isActive: () => getVirtualCameraService().state.running,
  },
  TOGGLE_VIRTUAL_CAMERA_OFF: {
    name: 'TOGGLE_VIRTUAL_CAMERA_OFF',
    description: () => $t('Stop Virtual Camera'),
    down: () => getVirtualCameraService().stop(),
    isActive: () => !getVirtualCameraService().state.running,
  },
};

const SOURCE_ACTIONS: HotkeyGroup = {
  TOGGLE_MUTE: {
    name: 'TOGGLE_MUTE',
    description: () => $t('Mute'),
    down: sourceId => getSourcesService().setMuted(sourceId, true),
    isActive: sourceId => !!getSourcesService().views.getSource(sourceId)?.muted,
    shouldApply: isAudio,
  },
  TOGGLE_UNMUTE: {
    name: 'TOGGLE_UNMUTE',
    description: () => $t('Unmute'),
    down: sourceId => getSourcesService().setMuted(sourceId, false),
    isActive: sourceId => getSourcesService().views.getSource(sourceId)?.muted === false,
    shouldApply: isAudio,
  },
  PUSH_TO_MUTE: {
    name: 'PUSH_TO_MUTE',
    description: () => $t('Push to Mute'),
    down: sourceId => getSourcesService().setMuted(sourceId, true),
    up: sourceId => getSourcesService().setMuted(sourceId, false),
    shouldApply: isAudio,
  },
  PUSH_TO_TALK: {
    name: 'PUSH_TO_TALK',
    description: () => $t('Push to Talk'),
    down: sourceId => getSourcesService().setMuted(sourceId, false),
    up: sourceId => getSourcesService().setMuted(sourceId, true),
    shouldApply: isAudio,
  },
  GAME_CAPTURE_HOTKEY_START: {
    name: 'GAME_CAPTURE_HOTKEY_START',
    description: () => $t('Capture Foreground Window'),
    up: processObsHotkey(false),
    down: processObsHotkey(true),
    shouldApply: isSourceType('game_capture'),
  },
  GAME_CAPTURE_HOTKEY_STOP: {
    name: 'GAME_CAPTURE_HOTKEY_STOP',
    description: () => $t('Deactivate Capture'),
    up: processObsHotkey(false),
    down: processObsHotkey(true),
    shouldApply: isSourceType('game_capture'),
  },
  SLIDESHOW_PLAYPAUSE: {
    name: 'SLIDESHOW_PLAYPAUSE',
    description: () => $t('Play/Pause'),
    down: processObsHotkey(true),
    up: processObsHotkey(false),
    shouldApply: isSourceType('slideshow'),
  },
  SLIDESHOW_RESTART: {
    name: 'SLIDESHOW_RESTART',
    description: () => $t('Restart'),
    down: processObsHotkey(true),
    up: processObsHotkey(false),
    shouldApply: isSourceType('slideshow'),
  },
  SLIDESHOW_STOP: {
    name: 'SLIDESHOW_STOP',
    description: () => $t('Stop'),
    down: processObsHotkey(true),
    up: processObsHotkey(false),
    shouldApply: isSourceType('slideshow'),
  },
  SLIDESHOW_NEXTSLIDE: {
    name: 'SLIDESHOW_NEXTSLIDE',
    description: () => $t('Next Slide'),
    down: processObsHotkey(true),
    up: processObsHotkey(false),
    shouldApply: isSourceType('slideshow'),
  },
  SLIDESHOW_PREVIOUSSLIDE: {
    name: 'SLIDESHOW_PREVIOUSSLIDE',
    description: () => $t('Previous Slide'),
    down: processObsHotkey(true),
    up: processObsHotkey(false),
    shouldApply: isSourceType('slideshow'),
  },
  FFMPEG_SOURCE_RESTART: {
    name: 'FFMPEG_SOURCE_RESTART',
    description: () => $t('Restart'),
    down: processObsHotkey(true),
    up: processObsHotkey(false),
    shouldApply: isSourceType('ffmpeg_source'),
  },
};

const SCENE_ACTIONS: HotkeyGroup = {
  SWITCH_TO_SCENE: {
    name: 'SWITCH_TO_SCENE',
    description: () => $t('Switch to scene'),
    down: sceneId => getScenesService().makeSceneActive(sceneId),
  },
};

const SCENE_ITEM_ACTIONS: HotkeyGroup = {
  TOGGLE_SOURCE_VISIBILITY_SHOW: {
    name: 'TOGGLE_SOURCE_VISIBILITY_SHOW',
    description: sceneItemId => {
      const sceneItem = getScenesService().views.getSceneItem(sceneItemId);
      return $t('Show %{sourcename}', { sourcename: sceneItem?.source.name });
    },
    shouldApply: sceneItemId => !!getScenesService().views.getSceneItem(sceneItemId)?.video,
    isActive: sceneItemId => !!getScenesService().views.getSceneItem(sceneItemId)?.visible,
    down: sceneItemId => getScenesService().views.getSceneItem(sceneItemId)?.setVisibility(true),
  },
  TOGGLE_SOURCE_VISIBILITY_HIDE: {
    name: 'TOGGLE_SOURCE_VISIBILITY_HIDE',
    description: sceneItemId => {
      const sceneItem = getScenesService().views.getSceneItem(sceneItemId);
      return $t('Hide %{sourcename}', { sourcename: sceneItem?.source.name });
    },
    shouldApply: sceneItemId => !!getScenesService().views.getSceneItem(sceneItemId)?.video,
    isActive: sceneItemId => getScenesService().views.getSceneItem(sceneItemId)?.visible === false,
    down: sceneItemId => getScenesService().views.getSceneItem(sceneItemId)?.setVisibility(false),
  },
  PUSH_TO_SOURCE_SHOW: {
    name: 'PUSH_TO_SOURCE_SHOW',
    description: sceneItemId => {
      const sceneItem = getScenesService().views.getSceneItem(sceneItemId);
      return $t('Push to Show %{sourcename}', { sourcename: sceneItem?.source.name });
    },
    shouldApply: sceneItemId => !!getScenesService().views.getSceneItem(sceneItemId)?.video,
    up: sceneItemId => getScenesService().views.getSceneItem(sceneItemId)?.setVisibility(false),
    down: sceneItemId => getScenesService().views.getSceneItem(sceneItemId)?.setVisibility(true),
  },
  PUSH_TO_SOURCE_HIDE: {
    name: 'PUSH_TO_SOURCE_HIDE',
    description: sceneItemId => {
      const sceneItem = getScenesService().views.getSceneItem(sceneItemId);
      return $t('Push to Hide %{sourcename}', { sourcename: sceneItem?.source.name });
    },
    shouldApply: sceneItemId => !!getScenesService().views.getSceneItem(sceneItemId)?.video,
    up: sceneItemId => getScenesService().views.getSceneItem(sceneItemId)?.setVisibility(true),
    down: sceneItemId => getScenesService().views.getSceneItem(sceneItemId)?.setVisibility(false),
  },
};

const MARKERS_ACTIONS: HotkeyGroup = {
  MARKER_1: {
    name: 'MARKER_1',
    description: () => getMarkersService().views.getLabel('MARKER_1'),
    down: () => getMarkersService().actions.addMarker('MARKER_1'),
  },
  MARKER_2: {
    name: 'MARKER_2',
    description: () => getMarkersService().views.getLabel('MARKER_2'),
    down: () => getMarkersService().actions.addMarker('MARKER_2'),
  },
  MARKER_3: {
    name: 'MARKER_3',
    description: () => getMarkersService().views.getLabel('MARKER_3'),
    down: () => getMarkersService().actions.addMarker('MARKER_3'),
  },
  MARKER_4: {
    name: 'MARKER_4',
    description: () => getMarkersService().views.getLabel('MARKER_4'),
    down: () => getMarkersService().actions.addMarker('MARKER_4'),
  },
};

/**
 * All possible hotkeys should be defined in this object.
 * All information about the hotkey and its behavior is
 * encapsulated within the action definition here.
 *
 * WARNING: Changing the name of existing hotkey actions
 * will cause people to lose their saved keybindings. The
 * name shouldn't really change after it is added.
 */
const ACTIONS: HotkeyGroup = {
  ...GENERAL_ACTIONS,
  ...SOURCE_ACTIONS,
  ...SCENE_ACTIONS,
  ...SCENE_ITEM_ACTIONS,
  ...MARKERS_ACTIONS,
};

/**
 * Represents a serialized Hotkey
 */
export interface IHotkey {
  actionName: string;
  bindings: IBinding[];
  description?: string;
  sceneId?: string;
  sourceId?: string;
  sceneItemId?: string;
  hotkeyId?: number;
  isMarker?: boolean;
  display?: TDisplayType;
}

/**
 * Represents the full set of bindable hotkeys
 * for convenient render inside a component
 */
export interface IHotkeysSet {
  general: IHotkey[];
  sources: Dictionary<IHotkey[]>;
  scenes: Dictionary<IHotkey[]>;
  markers: IHotkey[];
}

interface IHotkeysServiceState {
  hotkeys: IHotkey[]; // only bound hotkeys are stored
}

type OBSHotkey = {
  ObjectName: string;
  ObjectType: obs.EHotkeyObjectType;
  HotkeyName: string;
  HotkeyDesc: string;
  HotkeyId: number;
};

export class HotkeysService extends StatefulService<IHotkeysServiceState> {
  static initialState: IHotkeysServiceState = {
    hotkeys: [],
  };

  @Inject() private scenesService: ScenesService;
  @Inject() private sourcesService: SourcesService;
  @Inject() private keyListenerService: KeyListenerService;
  @Inject() private usageStatisticsService: UsageStatisticsService;

  /**
   * Memoizes the currently registered hotkeys
   */
  private registeredHotkeys: Hotkey[] | null;

  init() {
    this.scenesService.sceneAdded.subscribe(() => this.invalidate());
    this.scenesService.sceneRemoved.subscribe(() => this.invalidate());
    this.scenesService.itemAdded.subscribe(() => this.invalidate());
    this.scenesService.itemRemoved.subscribe(() => this.invalidate());
    this.sourcesService.sourceAdded.subscribe(() => this.invalidate());
    this.sourcesService.sourceRemoved.subscribe(() => this.invalidate());
  }

  addHotkey(hotkeyModel: IHotkey) {
    this.ADD_HOTKEY(hotkeyModel);
  }

  private invalidate() {
    this.registeredHotkeys = null;
  }

  private updateRegisteredHotkeys() {
    const hotkeys: Dictionary<IHotkey> = {};
    /*
     * Since we're hybrid at this point, track already-added hotkeys so OBS
     * hotkeys don't duplicate them
     */
    const addedHotkeys = new Set<string>();

    Object.values(GENERAL_ACTIONS).forEach(action => {
      const hotkey: IHotkey = {
        actionName: action.name,
        bindings: [],
      };
      hotkeys[getHotkeyHash(hotkey)] = hotkey;
      addedHotkeys.add(action.name);
    });

    this.scenesService.views.scenes.forEach(scene => {
      Object.values(SCENE_ACTIONS).forEach(action => {
        const hotkey: IHotkey = {
          actionName: action.name,
          bindings: [],
          sceneId: scene.id,
        };
        hotkeys[getHotkeyHash(hotkey)] = hotkey;
        addedHotkeys.add(`${action.name}-${scene.id}`);
      });

      scene.getItems().forEach(sceneItem => {
        Object.values(SCENE_ITEM_ACTIONS).forEach(action => {
          const hotkey: IHotkey = {
            actionName: action.name,
            bindings: [],
            sceneItemId: sceneItem.sceneItemId,
            display: sceneItem?.display,
          };
          hotkeys[getHotkeyHash(hotkey)] = hotkey;
          addedHotkeys.add(`${action.name}-${sceneItem.sceneItemId}`);
        });
      });
    });

    Object.values(MARKERS_ACTIONS).forEach(action => {
      const hotkey: IHotkey = {
        actionName: action.name,
        bindings: [],
        isMarker: true,
      };
      hotkeys[getHotkeyHash(hotkey)] = hotkey;
      addedHotkeys.add(action.name);
    });

    const obsHotkeys: OBSHotkey[] = obs.NodeObs.OBS_API_QueryHotkeys();

    obsHotkeys
      .filter(hotkey => this.isSupportedHotkey(hotkey))
      .forEach(hotkey => {
        const action = this.getActionForHotkey(hotkey);

        if (action && action.name) {
          const hk: IHotkey = {
            sourceId: hotkey.ObjectName,
            actionName: action.name,
            bindings: [] as IBinding[],
            hotkeyId: hotkey.HotkeyId,
          };

          if (!hotkeys[getHotkeyHash(hk)]) {
            hotkeys[getHotkeyHash(hk)] = hk;
          }
        }
      });

    this.state.hotkeys.forEach(savedHotkey => {
      const hotkey = hotkeys[getHotkeyHash(savedHotkey)];
      if (hotkey) hotkey.bindings = [...savedHotkey.bindings];
    });

    this.registeredHotkeys = Object.keys(hotkeys).map(key => this.getHotkey(hotkeys[key]));
  }

  getHotkey(obj: IHotkey): Hotkey {
    return new Hotkey(obj);
  }

  // Only works for general hotkeys for now
  getGeneralHotkeyByName(name: string) {
    return this.getHotkeysSet().general.find(hotkey => hotkey.actionName === name);
  }

  // Only works for general hotkeys for now
  applyGeneralHotkey(hotkey: IHotkey) {
    const set = this.getHotkeysSet();
    set.general.forEach(h => {
      if (h.actionName === hotkey.actionName) {
        h.bindings = hotkey.bindings;
      }
    });
    this.applyHotkeySet(set);
  }

  getHotkeys(): Hotkey[] {
    if (!this.registeredHotkeys) this.updateRegisteredHotkeys();
    return (this.registeredHotkeys ?? []).filter(hotkey => hotkey.shouldApply);
  }

  getHotkeysSet(): IHotkeysSet {
    const sourcesHotkeys: Dictionary<Hotkey[]> = {};
    this.sourcesService.views.getSources().forEach(source => {
      const sourceHotkeys = this.getSourceHotkeys(source.sourceId);
      if (sourceHotkeys.length) sourcesHotkeys[source.sourceId] = sourceHotkeys;
    });

    const scenesHotkeys: Dictionary<Hotkey[]> = {};
    this.scenesService.views.scenes.forEach(scene => {
      const sceneItemsHotkeys = this.getSceneItemsHotkeys(scene.id);
      const sceneHotkeys = sceneItemsHotkeys.concat(this.getSceneHotkeys(scene.id));
      if (sceneHotkeys.length) scenesHotkeys[scene.id] = sceneHotkeys;
    });

    const markersHotkeys = this.getHotkeys().filter(hotkey => hotkey.type === 'MARKER');

    return {
      general: this.serializeHotkeys(this.getGeneralHotkeys()),
      sources: this.serializeHotkeys(sourcesHotkeys),
      scenes: this.serializeHotkeys(scenesHotkeys),
      markers: this.serializeHotkeys(markersHotkeys),
    };
  }

  /**
   * Hotkey service helpers are extremely expensive to create from the
   * child window, so we serialize them here first.
   * @param hotkeys A group of hotkeys, either an array or a dictionary
   */
  private serializeHotkeys(hotkeys: Dictionary<Hotkey[]>): Dictionary<IHotkey[]>;
  private serializeHotkeys(hotkeys: Hotkey[]): IHotkey[];
  private serializeHotkeys(
    hotkeys: Dictionary<Hotkey[]> | Hotkey[],
  ): Dictionary<IHotkey[]> | IHotkey[] {
    if (Array.isArray(hotkeys)) {
      return hotkeys.map(h => ({ ...h.getModel(), description: h.description }));
    }

    return mapValues(hotkeys, h => this.serializeHotkeys(h));
  }

  clearAllHotkeys() {
    this.applyHotkeySet({
      general: [],
      sources: {},
      scenes: {},
      markers: [],
    });
  }

  applyHotkeySet(hotkeySet: IHotkeysSet) {
    const hotkeys: IHotkey[] = [];
    hotkeys.push(...hotkeySet.general);
    Object.keys(hotkeySet.scenes).forEach(sceneId => hotkeys.push(...hotkeySet.scenes[sceneId]));
    Object.keys(hotkeySet.sources).forEach(sourceId =>
      hotkeys.push(...hotkeySet.sources[sourceId]),
    );
    hotkeys.push(...hotkeySet.markers);
    this.setHotkeys(hotkeys);
    this.bindHotkeys();
  }

  getGeneralHotkeys(): Hotkey[] {
    return this.getHotkeys().filter(hotkey => hotkey.type === 'GENERAL');
  }

  getSourceHotkeys(sourceId: string): Hotkey[] {
    return this.getHotkeys().filter(hotkey => hotkey.sourceId === sourceId);
  }

  getSceneHotkeys(sceneId: string): Hotkey[] {
    return this.getHotkeys().filter(hotkey => hotkey.sceneId === sceneId);
  }

  getSceneItemsHotkeys(sceneId: string): Hotkey[] {
    const scene = this.scenesService.views.getScene(sceneId);
    const sceneItemsIds = scene?.nodes.map(item => item.id) ?? [];
    return this.getHotkeys().filter(hotkey => sceneItemsIds.includes(hotkey.sceneItemId ?? ''));
  }

  getSceneItemHotkeys(sceneItemId: string): Hotkey[] {
    return this.getHotkeys().filter(hotkey => hotkey.sceneItemId === sceneItemId);
  }

  getMarkerHotkeys(): Hotkey[] {
    return this.getHotkeys().filter(hotkey => hotkey.type === 'MARKER');
  }

  unregisterAll() {
    this.keyListenerService.unregisterAll();
  }

  private setHotkeys(hotkeys: IHotkey[]) {
    this.CLEAR_HOTKEYS();
    hotkeys.forEach(hotkey => {
      if (hotkey.bindings.length) this.ADD_HOTKEY(hotkey);
    });
    this.invalidate();
  }

  bindHotkeys() {
    this.unregisterAll();

    // Node-libuiohook does not support binding multiple callbacks to
    // a single key event, so we have to group them by binding

    const downBindingMap = new Map<string, Hotkey[]>();
    const upBindingMap = new Map<string, Hotkey[]>();

    this.getHotkeys().forEach(hotkey => {
      hotkey.bindings.forEach(binding => {
        const downHotkeys = downBindingMap.get(JSON.stringify(binding)) || [];
        const upHotkeys = upBindingMap.get(JSON.stringify(binding)) || [];

        if (hotkey.action.downHandler) downHotkeys.push(hotkey);
        if (hotkey.action.upHandler) upHotkeys.push(hotkey);

        downBindingMap.set(JSON.stringify(binding), downHotkeys);
        upBindingMap.set(JSON.stringify(binding), upHotkeys);
      });
    });

    downBindingMap.forEach((hotkeys, bindingStr) => {
      const binding = JSON.parse(bindingStr);

      this.keyListenerService.register({
        ...binding,
        eventType: 'registerKeydown',
        callback: () => {
          this.usageStatisticsService.recordFeatureUsage('HotkeyPress');
          hotkeys.forEach(hotkey => hotkey.action.downHandler && hotkey.action.downHandler());
        },
      });
    });

    upBindingMap.forEach((hotkeys, bindingStr) => {
      const binding = JSON.parse(bindingStr);

      this.keyListenerService.register({
        ...binding,
        eventType: 'registerKeyup',
        callback: () =>
          hotkeys.forEach(hotkey => hotkey.action.upHandler && hotkey.action.upHandler()),
      });
    });
  }

  @mutation()
  private ADD_HOTKEY(hotkeyObj: IHotkey) {
    this.state.hotkeys.push(hotkeyObj);
  }

  @mutation()
  private SET_BINDINGS(hotkeyInd: number, bindings: IBinding[]) {
    this.state.hotkeys[hotkeyInd].bindings = bindings;
  }

  @mutation()
  private CLEAR_HOTKEYS() {
    this.state.hotkeys = [];
  }

  private isSupportedHotkey(hotkey: OBSHotkey) {
    if (hotkey.ObjectType !== obs.EHotkeyObjectType.Source) {
      return false;
    }

    const action = this.getActionForHotkey(hotkey);

    return action && action.name && idPropFor(hotkey);
  }

  private getActionForHotkey(hotkey: OBSHotkey): IHotkeyAction | null {
    const action = getActionFromName(hotkey.HotkeyName);

    // Return the action immediately if there's a 1-1 mapping
    if (action && action.name) {
      return action;
    }

    // Otherwise prefix the hotkey name with its source type
    const source = this.sourcesService.views.getSource(hotkey.ObjectName);

    if (source) {
      return ACTIONS[`${source.type.toUpperCase()}_${hotkey.HotkeyName}`];
    }

    return null;
  }
}

/**
 * Represents a single bindable hotkey
 */
@ServiceHelper('HotkeysService')
export class Hotkey implements IHotkey {
  actionName: string;
  sceneId?: string;
  sourceId?: string;
  sceneItemId?: string;
  isMarker?: boolean;
  bindings: IBinding[];

  type: THotkeyType;
  description: string;
  action: IHotkeyAction;
  shouldApply: boolean;
  display?: TDisplayType;

  private readonly hotkeyModel: IHotkey;

  constructor(hotkeyModel: IHotkey) {
    Object.assign(this, hotkeyModel);
    this.hotkeyModel = hotkeyModel;

    if (this.sourceId) {
      this.type = 'SOURCE';
    } else if (this.sceneItemId) {
      this.type = 'SCENE_ITEM';
    } else if (this.sceneId) {
      this.type = 'SCENE';
    } else if (this.isMarker) {
      this.type = 'MARKER';
    } else {
      this.type = 'GENERAL';
    }

    const entityId = this.sourceId ?? this.sceneId ?? this.sceneItemId ?? 'NO_ENTITY';

    this.action = this.getAction(entityId);
    this.description = this.action.description(entityId);
    this.shouldApply = (this.action.shouldApply && this.action.shouldApply(entityId)) ?? false;
  }

  isDestroyed() {
    return false;
  }

  equals(other: IHotkey) {
    return (
      this.actionName === other.actionName &&
      this.sceneId === other.sceneId &&
      this.sourceId === other.sourceId &&
      this.sceneItemId === other.sceneItemId
    );
  }

  getModel(): IHotkey {
    return { ...this.hotkeyModel };
  }

  private getAction(entityId: string): IHotkeyAction {
    const action = getActionFromName(this.actionName);

    const { up, down } = action;

    // Fill in optional functions with some defaults
    if (!action.isActive) action.isActive = () => false;
    if (!action.shouldApply) action.shouldApply = () => true;

    // We defer the actions until after we've decided whether
    // or not to execute each action.
    if (up) {
      action.upHandler = () => {
        if (action.isActive && !action.isActive(entityId)) {
          defer(() => up(entityId, this.hotkeyModel.hotkeyId));
        }
      };
    }

    if (down) {
      action.downHandler = () => {
        if (action.isActive && !action.isActive(entityId)) {
          defer(() => down(entityId, this.hotkeyModel.hotkeyId));
        }
      };
    }

    return action;
  }
}

const getMigrationMapping = (actionName: string) => {
  return {
    MUTE: 'TOGGLE_MUTE',
    UNMUTE: 'TOGGLE_UNMUTE',
  }[normalizeActionName(actionName)] as string;
};

const getActionFromName = (actionName: string) => ({
  ...(ACTIONS[actionName] || ACTIONS[getMigrationMapping(actionName)]),
});

const isSceneItem = (hotkey: OBSHotkey) =>
  !!getScenesService().views.getSceneItem(hotkey.ObjectName);

const isSource = (hotkey: OBSHotkey) => !!getSourcesService().views.getSource(hotkey.ObjectName);

const isScene = (hotkey: OBSHotkey) => !!getScenesService().views.getScene(hotkey.ObjectName);

const idPropFor = (hotkey: OBSHotkey) => {
  if (isSource(hotkey)) {
    return 'sourceId';
    // tslint:disable-next-line:no-else-after-return false positive
  } else if (isScene(hotkey)) {
    return 'sceneId';
  } else if (isSceneItem(hotkey)) {
    return 'sceneItemId';
  } else {
    return null;
  }
};

const normalizeActionName = (actionName: string) => actionName.split('.')[0];
