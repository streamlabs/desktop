import { mutation, StatefulService } from 'services/core/stateful-service';
import * as obs from '../../obs-api';
import { Inject } from 'services/core/injector';
import { IObsListOption, TObsValue, TObsFormData } from 'components/obs/inputs/ObsInput';
import { WindowsService } from 'services/windows';
import { ScenesService } from 'services/scenes';
import uuid from 'uuid/v4';
import { SceneCollectionsService } from 'services/scene-collections';
import { $t } from 'services/i18n';
import { DefaultManager } from 'services/sources/properties-managers/default-manager';
import { Subject } from 'rxjs';
import { getKeys } from 'util/getKeys';

export enum ETransitionType {
  Cut = 'cut_transition',
  Fade = 'fade_transition',
  Swipe = 'swipe_transition',
  Slide = 'slide_transition',
  FadeToColor = 'fade_to_color_transition',
  LumaWipe = 'wipe_transition',
  Stinger = 'obs_stinger_transition',
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

interface ITransitionConnection {
  id: string;
  fromSceneId: string;
  toSceneId: string;
  transitionId: string;
}

interface ITransitionCreateOptions {
  id?: string;
  settings?: Dictionary<TObsValue>;
  propertiesManagerSettings?: Dictionary<any>;
  duration?: number;
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

  studioModeChanged = new Subject<boolean>();

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
  }

  getTypes(): IObsListOption<ETransitionType>[] {
    return [
      { description: $t('transitions.cut_transition'), value: ETransitionType.Cut },
      { description: $t('transitions.fade_transition'), value: ETransitionType.Fade },
      { description: $t('transitions.swipe_transition'), value: ETransitionType.Swipe },
      { description: $t('transitions.slide_transition'), value: ETransitionType.Slide },
      {
        description: $t('transitions.fade_to_color_transition'),
        value: ETransitionType.FadeToColor,
      },
      { description: $t('transitions.wipe_transition'), value: ETransitionType.LumaWipe },
      { description: $t('transitions.obs_stinger_transition'), value: ETransitionType.Stinger },
    ];
  }

  enableStudioMode() {
    if (this.state.studioMode) return;

    this.SET_STUDIO_MODE(true);
    this.studioModeChanged.next(true);

    if (!this.studioModeTransition) this.createStudioModeTransition();
    const currentScene = this.scenesService.activeScene.getObsScene();
    this.sceneDuplicate = currentScene.duplicate(uuid(), obs.ESceneDupType.Copy);

    // Immediately switch to the duplicated scene
    this.getCurrentTransition().set(this.sceneDuplicate);

    this.studioModeTransition.set(currentScene);
  }

  disableStudioMode() {
    if (!this.state.studioMode) return;

    this.SET_STUDIO_MODE(false);
    this.studioModeChanged.next(false);

    this.getCurrentTransition().set(this.scenesService.activeScene.getObsScene());
    this.releaseStudioModeObjects();
  }

  /**
   * While in studio mode, will execute a studio mode transition
   */
  executeStudioModeTransition() {
    if (!this.state.studioMode) return;
    if (this.studioModeLocked) return;

    this.studioModeLocked = true;

    const currentScene = this.scenesService.activeScene.getObsScene();

    const oldDuplicate = this.sceneDuplicate;
    this.sceneDuplicate = currentScene.duplicate(uuid(), obs.ESceneDupType.Copy);

    // TODO: Make this a dropdown box
    const transition = this.getDefaultTransition();
    const obsTransition = this.obsTransitions[transition.id];

    obsTransition.set(this.getCurrentTransition().getActiveSource());
    obs.Global.setOutputSource(0, obsTransition);
    obsTransition.start(transition.duration, this.sceneDuplicate);

    oldDuplicate.release();

    setTimeout(() => (this.studioModeLocked = false), transition.duration);
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
      this.studioModeTransition.release();
      this.studioModeTransition = null;
    }
    if (this.sceneDuplicate) {
      this.sceneDuplicate.release();
      this.sceneDuplicate = null;
    }
  }

  get studioTransitionName() {
    if (this.studioModeTransition) {
      return this.studioModeTransition.name;
    }
  }

  transition(sceneAId: string, sceneBId: string) {
    if (this.state.studioMode) {
      const scene = this.scenesService.getScene(sceneBId);
      this.studioModeTransition.set(scene.getObsScene());
      return;
    }

    // We should almost always have a valid transition by this point
    // if the scene collections service has done its job.  However,
    // this catch all ensure we at least have 1 basic transition in
    // place when we try to transition.
    this.ensureTransition();

    const obsScene = this.scenesService.getScene(sceneBId).getObsScene();
    const transition = this.getConnectedTransition(sceneAId, sceneBId);
    const obsTransition = this.obsTransitions[transition.id];

    if (sceneAId) {
      obsTransition.set(this.scenesService.getScene(sceneAId).getObsScene());
      obs.Global.setOutputSource(0, obsTransition);
      obsTransition.start(transition.duration, obsScene);
    } else {
      const defaultTransition = obs.TransitionFactory.create(ETransitionType.Cut, uuid());
      defaultTransition.set(obsScene);
      obs.Global.setOutputSource(0, defaultTransition);
      obsTransition.start(transition.duration, obsScene);
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

    return this.getDefaultTransition();
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
      this.createTransition(ETransitionType.Cut, 'Global Transition');
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
    return this.propertiesManagers[id].setPropertiesFormData(formData);
  }

  createTransition(type: ETransitionType, name: string, options: ITransitionCreateOptions = {}) {
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

  addConnection(fromId: string, toId: string, transitionId: string) {
    const id = uuid();
    this.ADD_CONNECTION({
      id,
      fromSceneId: fromId,
      toSceneId: toId,
      transitionId,
    });
    return this.getConnection(id);
  }

  updateConnection(id: string, patch: Partial<ITransitionConnection>) {
    this.UPDATE_CONNECTION(id, patch);
  }

  deleteConnection(id: string) {
    this.DELETE_CONNECTION(id);
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

  setDuration(id: string, duration: number) {
    this.UPDATE_TRANSITION(id, { duration });
  }

  showSceneTransitions() {
    this.windowsService.showWindow({
      componentName: 'SceneTransitions',
      title: $t('transitions.sceneTransition'),
      size: {
        width: 800,
        height: 650,
      },
    });
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
      getKeys(patch).forEach(key => {
        // @ts-expect-error ts2332
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
      getKeys(patch).forEach(key => {
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
