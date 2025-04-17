import { mutation, StatefulService, ViewHandler } from 'services/core/stateful-service';
import * as obs from '../../obs-api';
import { Inject } from 'services/core/injector';
import { TObsValue, TObsFormData } from 'components/obs/inputs/ObsInput';
import { IListOption } from 'components/shared/inputs';
import { WindowsService } from 'services/windows';
import { ScenesService } from 'services/scenes';
import uuid from 'uuid/v4';
import { SceneCollectionsService } from 'services/scene-collections';
import { $t } from 'services/i18n';
import { DefaultManager } from 'services/sources/properties-managers/default-manager';
import { Subject } from 'rxjs';
import { isUrl } from '../util/requests';
import { getOS, OS } from 'util/operating-systems';
import { UsageStatisticsService } from './usage-statistics';
import { SourcesService } from 'services/sources';
import { DualOutputService } from './dual-output';
import { NotificationsService, ENotificationType } from './notifications';
import { VideoService } from 'services/video';

export const TRANSITION_DURATION_MAX = 2_000_000_000;

export enum ETransitionType {
  Cut = 'cut_transition',
  Fade = 'fade_transition',
  Swipe = 'swipe_transition',
  Shuffle = 'shuffle_transition',
  Slide = 'slide_transition',
  FadeToColor = 'fade_to_color_transition',
  LumaWipe = 'wipe_transition',
  Stinger = 'obs_stinger_transition',
  Motion = 'motion_transition',
}

interface ITransitionsState {
  transitions: ITransition[];
  connections: ITransitionConnection[];
  defaultTransitionId: string;
  studioMode: boolean;
}

interface ITransition {
  id: string;
  name: string;
  type: ETransitionType;
  duration: number;
}

export interface ITransitionConnection {
  id: string;
  fromSceneId: string;
  toSceneId: string;
  transitionId: string;
}

export interface ITransitionCreateOptions {
  id?: string;
  settings?: Dictionary<TObsValue>;
  propertiesManagerSettings?: Dictionary<any>;
  duration?: number;
}

class TransitionsViews extends ViewHandler<ITransitionsState> {
  getTypes(): IListOption<ETransitionType>[] {
    const types = [
      { title: $t('Cut'), value: ETransitionType.Cut },
      { title: $t('Fade'), value: ETransitionType.Fade },
      { title: $t('Swipe'), value: ETransitionType.Swipe },
      { title: $t('Slide'), value: ETransitionType.Slide },
      { title: $t('Fade to Color'), value: ETransitionType.FadeToColor },
      { title: $t('Luma Wipe'), value: ETransitionType.LumaWipe },
      { title: $t('Stinger'), value: ETransitionType.Stinger },
    ];

    if (getOS() === OS.Windows) {
      types.push({ title: $t('Motion'), value: ETransitionType.Motion });
      types.push({ title: $t('Shuffle'), value: ETransitionType.Shuffle });
    }

    return types;
  }

  /**
   * Returns true if this connection is redundant.  A redundant
   * connection has the same from/to scene ids as a connection
   * earlier in the order.
   */
  isConnectionRedundant(id: string) {
    const connection = this.getConnection(id);

    const match = this.state.connections.find(conn => {
      return conn.fromSceneId === connection.fromSceneId && conn.toSceneId === connection.toSceneId;
    });

    return match.id !== connection.id;
  }

  getConnection(id: string) {
    return this.state.connections.find(conn => conn.id === id);
  }

  get studioMode() {
    return this.state.studioMode;
  }
}

export class TransitionsService extends StatefulService<ITransitionsState> {
  static initialState = {
    transitions: [],
    connections: [],
    defaultTransitionId: null,
    studioMode: false,
  } as ITransitionsState;

  @Inject() windowsService: WindowsService;
  @Inject() scenesService: ScenesService;
  @Inject() sceneCollectionsService: SceneCollectionsService;
  @Inject() usageStatisticsService: UsageStatisticsService;
  @Inject() sourcesService: SourcesService;
  @Inject() videoService: VideoService;
  @Inject() dualOutputService: DualOutputService;
  @Inject() notificationsService: NotificationsService;

  get views() {
    return new TransitionsViews(this.state);
  }

  studioModeChanged = new Subject<boolean>();

  transitionPropertiesChanged = new Subject<string>();

  /**
   * This transition is used to render the left (EDIT) display
   * while in studio mode
   */
  studioModeTransition: obs.ITransition;

  /**
   * This is a duplicate of the current scene that is rendered
   * to the output while editing is taking place in studio mode.
   */
  sceneDuplicate: obs.IScene;

  /**
   * This is an application's id of duplicated scene from above
   */
  currentSceneId: string;

  /**
   * Used to prevent studio mode transitions before the current
   * one is complete.
   */
  studioModeLocked = false;

  /**
   * The actual underlying OBS transition objects
   */
  obsTransitions: Dictionary<obs.ITransition> = {};

  /**
   * The properties manager for each transition
   */
  propertiesManagers: Dictionary<DefaultManager> = {};

  init() {
    this.sceneCollectionsService.collectionWillSwitch.subscribe(() => {
      this.disableStudioMode();
    });

    if (!this.studioModeTransition) this.createStudioModeTransition();
  }

  enableStudioMode() {
    if (this.state.studioMode) return;
    if (this.dualOutputService.views.dualOutputMode) {
      this.notificationsService.actions.push({
        message: $t('Cannot toggle Studio Mode in Dual Output Mode.'),
        type: ENotificationType.WARNING,
        lifeTime: 2000,
      });
      return;
    }

    this.usageStatisticsService.recordFeatureUsage('StudioMode');
    this.SET_STUDIO_MODE(true);
    this.studioModeChanged.next(true);

    if (!this.studioModeTransition) this.createStudioModeTransition();
    this.currentSceneId = this.scenesService.views.activeScene.id;
    const currentScene = this.scenesService.views.activeScene.getObsScene();
    this.sceneDuplicate = currentScene.duplicate('scene_copy_' + uuid(), obs.ESceneDupType.Copy);

    // Immediately switch to the duplicated scene (Right window, Live)
    this.getCurrentTransition().set(this.sceneDuplicate);

    // Left window, Edit. Note: order of these 2 calls is important
    this.studioModeTransition.set(currentScene);
    obs.Global.addSceneToBackstage(this.studioModeTransition);
  }

  disableStudioMode() {
    if (!this.state.studioMode) return;

    this.SET_STUDIO_MODE(false);
    this.studioModeChanged.next(false);

    const currentScene = this.scenesService.views.activeScene;
    this.getCurrentTransition().set(currentScene.getObsScene());
    this.releaseStudioModeObjects();
  }

  /**
   * While in studio mode, will execute a studio mode transition
   */
  executeStudioModeTransition() {
    if (!this.state.studioMode) return;
    if (this.studioModeLocked) return;

    this.studioModeLocked = true;

    const currentScene = this.scenesService.views.activeScene;

    obs.Global.removeSceneFromBackstage(currentScene.getSource().getObsInput());

    const oldDuplicate = this.sceneDuplicate;
    this.sceneDuplicate = currentScene
      .getObsScene()
      .duplicate('scene_copy_' + uuid(), obs.ESceneDupType.Copy);

    // TODO: Make this a dropdown box
    const transition = this.getDefaultTransition();
    const obsTransition = this.obsTransitions[transition.id];

    obsTransition.set(this.getCurrentTransition().getActiveSource());
    obs.Global.setOutputSource(0, obsTransition);
    obsTransition.start(
      Math.min(transition.duration, TRANSITION_DURATION_MAX),
      this.sceneDuplicate,
    );

    setTimeout(() => {
      oldDuplicate.release();
      this.studioModeLocked = false;
      this.currentSceneId = this.scenesService.views.activeScene.id;
    }, Math.min(transition.duration, TRANSITION_DURATION_MAX));
  }

  /**
   * Fetches the transition currently attached to output channel 0
   */
  private getCurrentTransition() {
    return obs.Global.getOutputSource(0) as obs.ITransition;
  }

  /**
   * Creates a basic cut transition used when editing scenes in studio mode
   */
  createStudioModeTransition() {
    this.studioModeTransition = obs.TransitionFactory.create(
      ETransitionType.Cut,
      `studio_transition_${uuid()}`,
    );
  }

  releaseStudioModeObjects() {
    if (this.studioModeTransition) {
      obs.Global.removeSceneFromBackstage(this.studioModeTransition);
      this.studioModeTransition.release();
      this.studioModeTransition = null;
    }
    if (this.sceneDuplicate) {
      this.sceneDuplicate.release();
      this.sceneDuplicate = null;
    }
  }

  getStudioTransitionName() {
    if (this.studioModeTransition) {
      return this.studioModeTransition.name;
    }
  }

  transition(sceneAId: string | null, sceneBId: string) {
    if (this.state.studioMode) {
      if (sceneAId && sceneAId !== this.currentSceneId) {
        const prevScene = this.scenesService.views.getScene(sceneAId);
        obs.Global.removeSceneFromBackstage(prevScene.getSource().getObsInput());
      }

      const scene = this.scenesService.views.getScene(sceneBId);
      if (this.currentSceneId !== sceneBId) {
        obs.Global.addSceneToBackstage(scene.getSource().getObsInput());
      }

      this.studioModeTransition.set(scene.getObsScene());

      return;
    }

    // We should almost always have a valid transition by this point
    // if the scene collections service has done its job.  However,
    // this catch all ensure we at least have 1 basic transition in
    // place when we try to transition.
    this.ensureTransition();

    const obsScene = this.scenesService.views.getScene(sceneBId).getObsScene();
    const transition = this.getConnectedTransition(sceneAId, sceneBId);
    const obsTransition = this.obsTransitions[transition.id];

    if (transition.type === ETransitionType.Motion) {
      this.usageStatisticsService.recordFeatureUsage('MotionTransition');
    }

    if (sceneAId) {
      obsTransition.set(this.scenesService.views.getScene(sceneAId).getObsScene());
      obs.Global.setOutputSource(0, obsTransition);
      obsTransition.start(Math.min(transition.duration, TRANSITION_DURATION_MAX), obsScene);
    } else {
      const defaultTransition = obs.TransitionFactory.create(ETransitionType.Cut, uuid());
      defaultTransition.set(obsScene);
      obs.Global.setOutputSource(0, defaultTransition);
      obsTransition.start(Math.min(transition.duration, TRANSITION_DURATION_MAX), obsScene);
      defaultTransition.release();
    }
  }

  /**
   * Finds the correct transition to use when transitioning
   * between these 2 scenes, based on the current connections
   */
  getConnectedTransition(fromId: string, toId: string): ITransition {
    const matchedConnection = this.state.connections.find(connection => {
      return connection.fromSceneId === fromId && connection.toSceneId === toId;
    });

    if (matchedConnection && this.getTransition(matchedConnection.transitionId)) {
      return this.getTransition(matchedConnection.transitionId);
    }

    const wildcardConnection = this.getWildcardConnection(fromId, toId);

    if (wildcardConnection && this.getTransition(wildcardConnection.transitionId)) {
      return this.getTransition(wildcardConnection.transitionId);
    }

    return this.getDefaultTransition();
  }

  getWildcardConnection(fromId: string, toId: string) {
    const connection = this.state.connections.find(
      connect => connect.fromSceneId === 'ALL' && connect.toSceneId === toId,
    );
    if (connection) return connection;

    return this.state.connections.find(
      connection => connection.fromSceneId === fromId && connection.toSceneId === 'ALL',
    );
  }

  shutdown() {
    Object.values(this.obsTransitions).forEach(tran => tran.release());
    this.releaseStudioModeObjects();
    obs.Global.setOutputSource(0, null);
  }

  /**
   * Ensures there is at least 1 valid transition
   */
  ensureTransition() {
    if (this.state.transitions.length === 0) {
      this.createTransition(ETransitionType.Cut, $t('Global Transition'));
    }
  }

  getDefaultTransition() {
    return this.state.transitions.find(tran => tran.id === this.state.defaultTransitionId);
  }

  getSettings(id: string): Dictionary<TObsValue> {
    return this.obsTransitions[id].settings;
  }

  getPropertiesManagerSettings(id: string): Dictionary<any> {
    return this.propertiesManagers[id].settings;
  }

  getPropertiesFormData(id: string): TObsFormData {
    return this.propertiesManagers[id].getPropertiesFormData() || [];
  }

  setPropertiesFormData(id: string, formData: TObsFormData) {
    this.propertiesManagers[id].setPropertiesFormData(formData);
    this.transitionPropertiesChanged.next(id);
  }

  createTransition(type: ETransitionType, name: string, options: ITransitionCreateOptions = {}) {
    if (!this.views.getTypes().find(t => t.value === type)) {
      type = ETransitionType.Cut;
    }
    const id = options.id || uuid();
    const transition = obs.TransitionFactory.create(type, id, options.settings || {});
    const manager = new DefaultManager(transition, options.propertiesManagerSettings || {});

    this.obsTransitions[id] = transition;
    this.propertiesManagers[id] = manager;

    if (!this.state.defaultTransitionId) this.MAKE_DEFAULT(id);

    this.ADD_TRANSITION(id, name, type, options.duration || 300);
    return this.getTransition(id);
  }

  /**
   * Changing the type of a transition actually requires destroying
   * and recreating the underlying OBS transition
   * @param id the transition id
   * @param newType the new transition type
   */
  changeTransitionType(id: string, newType: ETransitionType) {
    const transition = this.getTransition(id);

    this.propertiesManagers[id].destroy();
    this.obsTransitions[id].release();

    this.obsTransitions[id] = obs.TransitionFactory.create(newType, id);
    this.propertiesManagers[id] = new DefaultManager(this.obsTransitions[id], {});

    this.UPDATE_TRANSITION(id, { type: newType });
    this.transitionPropertiesChanged.next(id);
  }

  renameTransition(id: string, newName: string) {
    this.UPDATE_TRANSITION(id, { name: newName });
  }

  deleteTransition(id: string) {
    this.propertiesManagers[id].destroy();
    delete this.propertiesManagers[id];

    this.obsTransitions[id].release();
    delete this.obsTransitions[id];
    this.DELETE_TRANSITION(id);
  }

  /**
   * Removes all transitions.  This should really only be used when
   * switching scene collections.
   */
  deleteAllTransitions() {
    this.state.transitions.forEach(transition => {
      this.deleteTransition(transition.id);
    });
  }

  /**
   * Removes all connections.  This should really only be used when
   * switching scene collections.
   */
  deleteAllConnections() {
    this.state.connections.forEach(connection => {
      this.deleteConnection(connection.id);
    });
  }

  setDefaultTransition(id: string) {
    this.MAKE_DEFAULT(id);
  }

  getTransition(id: string) {
    return this.state.transitions.find(tran => tran.id === id);
  }

  addConnection(fromId: string, toId: string, transitionId: string, connectionId?: string) {
    const id = connectionId || uuid();
    this.ADD_CONNECTION({
      id,
      transitionId,
      fromSceneId: fromId,
      toSceneId: toId,
    });
    return this.views.getConnection(id);
  }

  updateConnection(id: string, patch: Partial<ITransitionConnection>) {
    this.UPDATE_CONNECTION(id, patch);
  }

  deleteConnection(id: string) {
    this.DELETE_CONNECTION(id);
  }

  setDuration(id: string, duration: number) {
    this.UPDATE_TRANSITION(id, { duration });
  }

  showSceneTransitions() {
    this.windowsService.showWindow({
      componentName: 'SceneTransitions',
      title: $t('Scene Transitions'),
      size: {
        width: 800,
        height: 650,
      },
    });
  }

  clearPlatformAppTransitions(appId: string): void {
    Object.entries(this.propertiesManagers)
      .filter(([_, manager]) => {
        return manager.settings && (manager.settings as any).appId === appId;
      })
      .forEach(([propertyManagerId]) => {
        const formData = this.getPropertiesFormData(propertyManagerId);

        this.setPropertiesFormData(
          propertyManagerId,
          formData.map(setting => {
            // We really wanna make sure we're getting the right property
            if (setting.name && setting.name === 'path' && isUrl(setting.value as string)) {
              return { ...setting, value: '' };
            }

            return setting;
          }),
        );
      });
  }

  /**
   * Gets locked states for all transitions
   */
  getLockedStates() {
    const states: Dictionary<boolean> = {};

    this.state.transitions.forEach(transition => {
      states[transition.id] = this.getPropertiesManagerSettings(transition.id).locked;
    });

    return states;
  }

  /**
   * Sets a single source to the global output.
   * Useful for isolating the performance impact of a single source.
   * WARNING: Only used by the Theme Audit system. Should
   * never be used for real production systems and should never
   * be done while live.
   * @param sourceId the source id to inspect
   */
  inspectSource(sourceId: string) {
    const source = this.sourcesService.views.getSource(sourceId);
    if (!source) return;

    obs.Global.setOutputSource(0, source.getObsInput());
  }

  cancelInspectSource() {
    this.transition(null, this.scenesService.views.activeSceneId);
  }

  @mutation()
  private ADD_TRANSITION(id: string, name: string, type: ETransitionType, duration: number) {
    this.state.transitions.push({
      id,
      name,
      type,
      duration,
    });
  }

  @mutation()
  private UPDATE_TRANSITION(id: string, patch: Partial<ITransition>) {
    const transition = this.state.transitions.find(tran => tran.id === id);

    if (transition) {
      Object.keys(patch).forEach(key => {
        transition[key] = patch[key];
      });
    }
  }

  @mutation()
  private DELETE_TRANSITION(id: string) {
    this.state.transitions = this.state.transitions.filter(tran => tran.id !== id);

    if (this.state.defaultTransitionId === id) {
      if (this.state.transitions.length > 0) {
        this.state.defaultTransitionId = this.state.transitions[0].id;
      } else {
        this.state.defaultTransitionId = null;
      }
    }
  }

  @mutation()
  private MAKE_DEFAULT(id: string) {
    this.state.defaultTransitionId = id;
  }

  @mutation()
  private ADD_CONNECTION(connection: ITransitionConnection) {
    this.state.connections.push(connection);
  }

  @mutation()
  private UPDATE_CONNECTION(id: string, patch: Partial<ITransitionConnection>) {
    const connection = this.state.connections.find(conn => conn.id === id);

    if (connection) {
      Object.keys(patch).forEach(key => {
        connection[key] = patch[key];
      });
    }
  }

  @mutation()
  private DELETE_CONNECTION(id: string) {
    this.state.connections = this.state.connections.filter(conn => conn.id !== id);
  }

  @mutation()
  private SET_STUDIO_MODE(enabled: boolean) {
    this.state.studioMode = enabled;
  }
}
