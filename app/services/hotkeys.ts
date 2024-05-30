import { StreamingService } from 'services/streaming';
import { ScenesService } from 'services/scenes';
import { isNoAudioPropertiesManagerType, SourcesService } from 'services/sources';
import { TransitionsService } from 'services/transitions';
import { KeyListenerService } from 'services/key-listener';
import { StatefulService, mutation, ServiceHelper, Inject } from './core';
import { defer, mapValues } from 'lodash';
import { $t } from 'services/i18n';
import { NicoliveProgramService } from './nicolive-program/nicolive-program';

function getScenesService(): ScenesService {
  return ScenesService.instance;
}

function getSourcesService(): SourcesService {
  return SourcesService.instance;
}

function getStreamingService(): StreamingService {
  return StreamingService.instance;
}

function getNicoliveProgramService(): NicoliveProgramService {
  return NicoliveProgramService.instance;
}

function getTransitionsService(): TransitionsService {
  return TransitionsService.instance;
}

type THotkeyType = 'GENERAL' | 'SCENE' | 'SCENE_ITEM' | 'SOURCE';

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

  down(entityId: string): void;

  isActive?(entityId: string): boolean;
  shouldApply?(entityId: string): boolean;

  up?(entityId: string): void;

  // These are injected dynamically
  downHandler?(): void;
  upHandler?(): void;
}

/**
 * All possible hotkeys should be defined in this object.
 * All information about the hotkey and its behavior is
 * encapsulated within the action definition here.
 *
 * WARNING: Changing the name of existing hotkey actions
 * will cause people to lose their saved keybindings. The
 * name shouldn't really change after it is added.
 */
const HOTKEY_ACTIONS: Dictionary<IHotkeyAction[]> = {
  GENERAL: [
    {
      name: 'TOGGLE_START_STREAMING',
      description: () => $t('hotkeys.startStreaming'),
      down: () => getStreamingService().toggleStreamingAsync(),
      isActive: () => {
        const streamingService = getStreamingService();
        return streamingService.isStreaming;
      },
    },
    {
      name: 'TOGGLE_STOP_STREAMING',
      description: () => $t('hotkeys.stopStreaming'),
      down: () => {
        const streamingService = getStreamingService();
        streamingService.toggleStreamingAsync();
      },
      isActive: () => {
        const streamingService = getStreamingService();
        return !streamingService.isStreaming;
      },
    },
    {
      name: 'TOGGLE_START_RECORDING',
      description: () => $t('hotkeys.startRecording'),
      down: () => getStreamingService().toggleRecording(),
      isActive: () => getStreamingService().isRecording,
    },
    {
      name: 'TOGGLE_STOP_RECORDING',
      description: () => $t('hotkeys.stopRecording'),
      down: () => getStreamingService().toggleRecording(),
      isActive: () => !getStreamingService().isRecording,
    },
    {
      name: 'ENABLE_STUDIO_MODE',
      description: () => $t('hotkeys.enableStudioMode'),
      down: () => getTransitionsService().enableStudioMode(),
      isActive: () => getTransitionsService().state.studioMode,
    },
    {
      name: 'DISABLE_STUDIO_MODE',
      description: () => $t('hotkeys.disableStudioMode'),
      down: () => getTransitionsService().disableStudioMode(),
      isActive: () => !getTransitionsService().state.studioMode,
    },
    {
      name: 'TRANSITION_STUDIO_MODE',
      description: () => $t('hotkeys.studioModeTransition'),
      down: () => getTransitionsService().executeStudioModeTransition(),
    },
    {
      name: 'SAVE_REPLAY',
      description: () => $t('hotkeys.saveReplay'),
      down: () => getStreamingService().saveReplay(),
    },
    {
      name: 'START_PROGRAM',
      description: () => '番組開始',
      down: () => getNicoliveProgramService().startProgram(),
      isActive: () => {
        const nicolive = getNicoliveProgramService();
        return nicolive.state.isStarting || nicolive.state.status !== 'test';
      },
    },
    {
      name: 'END_PROGRAM',
      description: () => '番組終了',
      down: () => getNicoliveProgramService().endProgram(),
      isActive: () => {
        const nicolive = getNicoliveProgramService();
        return nicolive.state.isEnding || nicolive.state.status !== 'onAir';
      },
    },
  ],

  SCENE: [
    {
      name: 'SWITCH_TO_SCENE',
      description: () => $t('hotkeys.switchToScene'),
      down: sceneId => getScenesService().makeSceneActive(sceneId),
    },
  ],

  SCENE_ITEM: [
    {
      name: 'TOGGLE_SOURCE_VISIBILITY_SHOW',
      description: sceneItemId => {
        const sceneItem = getScenesService().getSceneItem(sceneItemId);
        return $t('hotkeys.showSource', { sourcename: sceneItem.source.name });
      },
      shouldApply: sceneItemId => getScenesService().getSceneItem(sceneItemId).video,
      isActive: sceneItemId => getScenesService().getSceneItem(sceneItemId).visible,
      down: sceneItemId => getScenesService().getSceneItem(sceneItemId).setVisibility(true),
    },

    {
      name: 'TOGGLE_SOURCE_VISIBILITY_HIDE',
      description: sceneItemId => {
        const sceneItem = getScenesService().getSceneItem(sceneItemId);
        return $t('hotkeys.hideSource', { sourcename: sceneItem.source.name });
      },
      shouldApply: sceneItemId => getScenesService().getSceneItem(sceneItemId).video,
      isActive: sceneItemId => !getScenesService().getSceneItem(sceneItemId).visible,
      down: sceneItemId => getScenesService().getSceneItem(sceneItemId).setVisibility(false),
    },
  ],

  SOURCE: [
    {
      name: 'TOGGLE_MUTE',
      description: () => $t('hotkeys.mute'),
      down: sourceId => getSourcesService().setMuted(sourceId, true),
      isActive: sourceId => getSourcesService().getSource(sourceId)?.muted,
      shouldApply: sourceId => getSourcesService().getSource(sourceId)?.audio,
    },
    {
      name: 'TOGGLE_UNMUTE',
      description: () => $t('hotkeys.unmute'),
      down: sourceId => getSourcesService().setMuted(sourceId, false),
      isActive: sourceId => !getSourcesService().getSource(sourceId)?.muted,
      shouldApply: sourceId => getSourcesService().getSource(sourceId)?.audio,
    },
    {
      name: 'PUSH_TO_MUTE',
      description: () => $t('hotkeys.pushToMute'),
      down: sourceId => getSourcesService().setMuted(sourceId, true),
      up: sourceId => getSourcesService().setMuted(sourceId, false),
      shouldApply: sourceId => getSourcesService().getSource(sourceId)?.audio,
    },
    {
      name: 'PUSH_TO_TALK',
      description: () => $t('hotkeys.pushToTalk'),
      down: sourceId => getSourcesService().setMuted(sourceId, false),
      up: sourceId => getSourcesService().setMuted(sourceId, true),
      shouldApply: sourceId => getSourcesService().getSource(sourceId)?.audio,
    },
  ],
};

/**
 * Represents a serialized Hotkey
 */
export interface IHotkey {
  actionName: string;
  bindings: IBinding[];
  sceneId?: string;
  sourceId?: string;
  sceneItemId?: string;
}

/**
 * Represents the full set of bindable hotkeys
 * for convenient render inside a component
 */
export interface IHotkeysSet {
  general: IHotkey[];
  sources: Dictionary<IHotkey[]>;
  scenes: Dictionary<IHotkey[]>;
}

interface IHotkeysServiceState {
  hotkeys: IHotkey[]; // only bound hotkeys are stored
}

export class HotkeysService extends StatefulService<IHotkeysServiceState> {
  static initialState: IHotkeysServiceState = {
    hotkeys: [],
  };

  @Inject()
  private scenesService: ScenesService;

  @Inject()
  private sourcesService: SourcesService;

  @Inject()
  private keyListenerService: KeyListenerService;

  /**
   * Memoizes the currently registered hotkeys
   */
  private registeredHotkeys: Hotkey[];

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
    const hotkeys: IHotkey[] = [];

    HOTKEY_ACTIONS.GENERAL.forEach(action => {
      hotkeys.push({
        actionName: action.name,
        bindings: [],
      });
    });

    this.scenesService.scenes.forEach(scene => {
      scene.getItems().forEach(sceneItem => {
        HOTKEY_ACTIONS.SCENE_ITEM.forEach(action => {
          hotkeys.push({
            actionName: action.name,
            bindings: [],
            sceneItemId: sceneItem.sceneItemId,
          });
        });
      });

      HOTKEY_ACTIONS.SCENE.forEach(action => {
        hotkeys.push({
          actionName: action.name,
          bindings: [],
          sceneId: scene.id,
        });
      });
    });

    this.sourcesService.getSources().forEach(source => {
      HOTKEY_ACTIONS.SOURCE.forEach(action => {
        hotkeys.push({
          actionName: action.name,
          bindings: [],
          sourceId: source.sourceId,
        });
      });
    });

    // Set up bindings from saved hotkeys
    // This is a slow O(n^2) process, and may need to
    // be optimized later.
    this.state.hotkeys.forEach(savedHotkey => {
      const hotkey = hotkeys.find(blankHotkey => {
        return this.getHotkey(blankHotkey).isSameHotkey(savedHotkey);
      });
      if (hotkey) hotkey.bindings = [].concat(savedHotkey.bindings);
    });

    this.registeredHotkeys = hotkeys.map(hotkeyModel => this.getHotkey(hotkeyModel));
  }

  getHotkey(obj: IHotkey): Hotkey {
    return new Hotkey(obj);
  }

  getHotkeys(): Hotkey[] {
    if (!this.registeredHotkeys) this.updateRegisteredHotkeys();
    return this.registeredHotkeys.filter(hotkey => hotkey.shouldApply);
  }

  getHotkeysSet(): IHotkeysSet {
    const sourcesHotkeys: Dictionary<Hotkey[]> = {};
    this.sourcesService.getSources().forEach(source => {
      if (isNoAudioPropertiesManagerType(source.getPropertiesManagerType())) return;
      const sourceHotkeys = this.getSourceHotkeys(source.sourceId);
      if (sourceHotkeys.length) sourcesHotkeys[source.sourceId] = sourceHotkeys;
    });

    const scenesHotkeys: Dictionary<Hotkey[]> = {};
    this.scenesService.scenes.forEach(scene => {
      const sceneItemsHotkeys = this.getSceneItemsHotkeys(scene.id);
      const sceneHotkeys = sceneItemsHotkeys.concat(this.getSceneHotkeys(scene.id));
      if (sceneHotkeys.length) scenesHotkeys[scene.id] = sceneHotkeys;
    });

    return {
      general: this.serializeHotkeys(this.getGeneralHotkeys()),
      sources: this.serializeHotkeys(sourcesHotkeys),
      scenes: this.serializeHotkeys(scenesHotkeys),
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
    });
  }

  applyHotkeySet(hotkeySet: IHotkeysSet) {
    const hotkeys: IHotkey[] = [];
    hotkeys.push(...hotkeySet.general);
    Object.keys(hotkeySet.scenes).forEach(sceneId => hotkeys.push(...hotkeySet.scenes[sceneId]));
    Object.keys(hotkeySet.sources).forEach(sourceId =>
      hotkeys.push(...hotkeySet.sources[sourceId]),
    );
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
    const scene = this.scenesService.getScene(sceneId);
    const sceneItemsIds = scene.nodes.map(item => item.id);
    return this.getHotkeys().filter(hotkey => sceneItemsIds.includes(hotkey.sceneItemId));
  }

  getSceneItemHotkeys(sceneItemId: string): Hotkey[] {
    return this.getHotkeys().filter(hotkey => hotkey.sceneItemId === sceneItemId);
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
        callback: () => hotkeys.forEach(hotkey => hotkey.action.downHandler()),
      });
    });

    upBindingMap.forEach((hotkeys, bindingStr) => {
      const binding = JSON.parse(bindingStr);

      this.keyListenerService.register({
        ...binding,
        eventType: 'registerKeyup',
        callback: () => hotkeys.forEach(hotkey => hotkey.action.upHandler()),
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
}

/**
 * Represents a single bindable hotkey
 */
@ServiceHelper()
export class Hotkey implements IHotkey {
  actionName: string;
  sceneId?: string;
  sourceId?: string;
  sceneItemId?: string;
  bindings: IBinding[];

  type: THotkeyType;
  description: string;
  action: IHotkeyAction;
  shouldApply: boolean;

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
    } else {
      this.type = 'GENERAL';
    }

    const entityId = this.sourceId || this.sceneId || this.sceneItemId;

    this.action = this.getAction(entityId);
    this.description = this.action.description(entityId);
    this.shouldApply = this.action.shouldApply(entityId);
  }

  isSameHotkey(other: IHotkey) {
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
    const action = {
      ...HOTKEY_ACTIONS[this.type].find(action => {
        return action.name === this.actionName;
      }),
    };

    const { up, down } = action;

    // Fill in optional functions with some defaults
    if (!action.isActive) action.isActive = () => false;
    if (!action.shouldApply) action.shouldApply = () => true;

    // We defer the actions until after we've decided whether
    // or not to execute each action.
    if (up) {
      action.upHandler = () => {
        if (!action.isActive(entityId)) {
          defer(() => up(entityId));
        }
      };
    }

    if (down) {
      action.downHandler = () => {
        if (!action.isActive(entityId)) {
          defer(() => down(entityId));
        }
      };
    }

    return action;
  }
}
