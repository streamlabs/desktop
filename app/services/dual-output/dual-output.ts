import { PersistentStatefulService, InitAfter, Inject, ViewHandler, mutation } from 'services/core';
import { verticalDisplayData } from '../settings-v2/default-settings-data';
import { ScenesService, SceneItem, TSceneNode } from 'services/scenes';
import { TDisplayType, VideoSettingsService } from 'services/settings-v2/video';
import { TPlatform } from 'services/platforms';
import { EPlaceType } from 'services/editor-commands/commands/reorder-nodes';
import { EditorCommandsService } from 'services/editor-commands';
import { Subject } from 'rxjs';
import { TOutputOrientation } from 'services/restream';
import { IVideoInfo } from 'obs-studio-node';
import { ICustomStreamDestination, StreamSettingsService } from 'services/settings/streaming';
import {
  ISceneCollectionsManifestEntry,
  SceneCollectionsService,
} from 'services/scene-collections';
import { UserService } from 'services/user';
import { SelectionService, Selection } from 'services/selection';
import { StreamingService } from 'services/streaming';
import { SettingsService } from 'services/settings';
import { SourcesService, TSourceType } from 'services/sources';
import { WidgetsService, WidgetType } from 'services/widgets';
import { RunInLoadingMode } from 'services/app/app-decorators';
import compact from 'lodash/compact';
import invert from 'lodash/invert';
import forEachRight from 'lodash/forEachRight';
import { byOS, OS } from 'util/operating-systems';
import { DefaultHardwareService } from 'services/hardware/default-hardware';

interface IDisplayVideoSettings {
  horizontal: IVideoInfo;
  vertical: IVideoInfo;
  activeDisplays: {
    horizontal: boolean;
    vertical: boolean;
  };
}
interface IDualOutputServiceState {
  dualOutputMode: boolean;
  videoSettings: IDisplayVideoSettings;
  isLoading: boolean;
}

enum EOutputDisplayType {
  Horizontal = 'horizontal',
  Vertical = 'vertical',
}

export type TDisplayPlatforms = {
  [Display in EOutputDisplayType]: TPlatform[];
};

export type TDisplayDestinations = {
  [Display in EOutputDisplayType]: string[];
};

class DualOutputViews extends ViewHandler<IDualOutputServiceState> {
  @Inject() private scenesService: ScenesService;
  @Inject() private videoSettingsService: VideoSettingsService;
  @Inject() private sceneCollectionsService: SceneCollectionsService;
  @Inject() private streamingService: StreamingService;

  get isLoading(): boolean {
    return this.state.isLoading;
  }

  get activeSceneId(): string {
    return this.scenesService.views.activeSceneId;
  }

  get dualOutputMode(): boolean {
    return this.state.dualOutputMode;
  }

  get activeCollection(): ISceneCollectionsManifestEntry {
    return this.sceneCollectionsService.activeCollection;
  }

  get sceneNodeMaps(): { [sceneId: string]: Dictionary<string> } {
    return this.activeCollection?.sceneNodeMaps || {};
  }

  get activeSceneNodeMap(): Dictionary<string> {
    return this.sceneCollectionsService?.sceneNodeMaps?.[this.activeSceneId];
  }

  /**
   * Confirm that an entry exists in the scene collections manifest's scene node map property
   */
  get hasVerticalNodes() {
    return !!this.sceneNodeMaps[this.activeSceneId];
  }

  /**
   * Determines if there are any node maps in the scene collections scene node map property in the
   * scene collections manifest. The existence of the node map in the scene collections manifest
   * shows that the scene collection has been converted to a dual output scene collection. To prevent
   * undefined or null errors from unexpected behavior, confirm that there are any entries in the
   * collection's scene node maps property.
   *
   * Also check to see if dual output mode is active so that a new scene created in dual output mode
   * will correctly create item and show display toggles.
   */
  get hasSceneNodeMaps(): boolean {
    const nodeMaps = this.sceneCollectionsService?.sceneNodeMaps;
    return this.dualOutputMode || (!!nodeMaps && Object.entries(nodeMaps).length > 0);
  }

  get isDualOutputCollection(): boolean {
    const nodeMaps = this.sceneCollectionsService?.sceneNodeMaps;
    if (!nodeMaps) return false;
    return Object.entries(nodeMaps).length > 0;
  }

  getEnabledTargets(destinationId: 'name' | 'url' = 'url') {
    const platforms = this.streamingService.views.activeDisplayPlatforms;

    /**
     * Returns the enabled destinations according to their assigned display
     */
    const destinations = this.streamingService.views.customDestinations.reduce(
      (displayDestinations: TDisplayDestinations, destination: ICustomStreamDestination) => {
        if (destination.enabled) {
          const id = destinationId === 'name' ? destination.name : destination.url;
          displayDestinations[destination.display ?? 'horizontal'].push(id);
        }
        return displayDestinations;
      },
      { horizontal: [], vertical: [] },
    );

    return {
      platforms,
      destinations,
    };
  }

  get horizontalNodeIds(): string[] {
    if (!this.activeSceneNodeMap) return;

    return Object.keys(this.activeSceneNodeMap);
  }

  get verticalNodeIds(): string[] {
    if (!this.activeSceneNodeMap) return;

    return Object.values(this.activeSceneNodeMap);
  }

  get videoSettings() {
    return this.state.videoSettings;
  }

  get activeDisplays() {
    return this.state.videoSettings.activeDisplays;
  }

  get showHorizontalDisplay() {
    return !this.state.dualOutputMode || (this.activeDisplays.horizontal && !this.state.isLoading);
  }

  get showVerticalDisplay() {
    return this.state.dualOutputMode && this.activeDisplays.vertical && !this.state.isLoading;
  }

  get onlyVerticalDisplayActive() {
    return this.activeDisplays.vertical && !this.activeDisplays.horizontal;
  }

  getPlatformDisplay(platform: TPlatform) {
    return this.streamingService.views.settings.platforms[platform]?.display;
  }

  getPlatformContext(platform: TPlatform) {
    const display = this.getPlatformDisplay(platform);
    return this.videoSettingsService.state[display];
  }

  getPlatformMode(platform: TPlatform): TOutputOrientation {
    const display = this.getPlatformDisplay(platform);
    if (!display) return 'landscape';
    return display === 'horizontal' ? 'landscape' : 'portrait';
  }

  getMode(display?: TDisplayType): TOutputOrientation {
    if (!display) return 'landscape';
    return display === 'horizontal' ? 'landscape' : 'portrait';
  }

  getHorizontalNodeId(verticalNodeId: string, sceneId?: string) {
    const sceneNodeMap = sceneId ? this.sceneNodeMaps[sceneId] : this.activeSceneNodeMap;
    if (!sceneNodeMap) return;

    return Object.keys(sceneNodeMap).find(
      (horizontalNodeId: string) => sceneNodeMap[horizontalNodeId] === verticalNodeId,
    );
  }

  getVerticalNodeId(horizontalNodeId: string, sceneId?: string): string {
    const sceneNodeMap = sceneId ? this.sceneNodeMaps[sceneId] : this.activeSceneNodeMap;
    if (!sceneNodeMap) return;

    return Object.values(sceneNodeMap).find(
      (verticalNodeId: string) => sceneNodeMap[horizontalNodeId] === verticalNodeId,
    );
  }

  getDualOutputNodeId(nodeId: string, sceneId?: string) {
    return this.getHorizontalNodeId(nodeId, sceneId) ?? this.getVerticalNodeId(nodeId, sceneId);
  }

  getVerticalNodeIds(sceneId: string): string[] {
    if (!this.sceneNodeMaps[sceneId]) return;

    return Object.values(this.sceneNodeMaps[sceneId]);
  }

  getNodeDisplay(nodeId: string, sceneId: string) {
    const sceneNodeMap = sceneId ? this.sceneNodeMaps[sceneId] : this.activeSceneNodeMap;

    if (sceneNodeMap && Object.values(sceneNodeMap).includes(nodeId)) {
      return 'vertical';
    }

    // return horizontal by default because if the sceneNodeMap doesn't exist
    // dual output has never been toggled on with this scene active
    return 'horizontal';
  }

  getPlatformContextName(platform?: TPlatform): TOutputOrientation {
    return this.getPlatformDisplay(platform) === 'horizontal' ? 'landscape' : 'portrait';
  }

  getDisplayContextName(display: TDisplayType): TOutputOrientation {
    return display === 'horizontal' ? 'landscape' : 'portrait';
  }

  /**
   * Get the visibility for the vertical node.
   * @remark Primarily used for the source toggles. The id of the node is determined either by the
   * @param nodeId
   * @param sceneId
   * @returns
   */
  getIsHorizontalVisible(nodeId: string, sceneId?: string) {
    if (!this.hasVerticalNodes) return false;
    return this.scenesService.views.getNodeVisibility(nodeId, sceneId ?? this.activeSceneId);
  }

  /**
   * Get the visibility for the vertical node.
   * @remark Primarily used for the source toggles. The id of the node is determined either by the
   * @param nodeId
   * @param sceneId
   * @returns
   */
  getIsVerticalVisible(nodeId: string, sceneId?: string) {
    // in the source selector, the vertical node id is determined by the visible display
    if (!this.hasVerticalNodes) return false;

    const id =
      this.activeDisplays.vertical && !this.activeDisplays.horizontal
        ? nodeId
        : this.activeSceneNodeMap[nodeId];

    return this.scenesService.views.getNodeVisibility(id, sceneId ?? this.activeSceneId);
  }

  /**
   * Confirm if a scene has a node map for dual output.
   * @remark If the scene collection does not have the scene node maps property in the
   * scene collection manifest, this will return false.
   * @param sceneId Optional id of the scene to look up. If no scene id is provided, the active
   * scene's id will be used.
   * @returns Boolean for whether or not the scene has an entry in the scene collections scene node map.
   */
  hasNodeMap(sceneId?: string): boolean {
    if (!this.sceneCollectionsService?.sceneNodeMaps) return false;
    const nodeMap = sceneId ? this.sceneNodeMaps[sceneId] : this.activeSceneNodeMap;
    return !!nodeMap && Object.keys(nodeMap).length > 0;
  }
}

@InitAfter('ScenesService')
export class DualOutputService extends PersistentStatefulService<IDualOutputServiceState> {
  @Inject() private scenesService: ScenesService;
  @Inject() private videoSettingsService: VideoSettingsService;
  @Inject() private editorCommandsService: EditorCommandsService;
  @Inject() private sceneCollectionsService: SceneCollectionsService;
  @Inject() private streamSettingsService: StreamSettingsService;
  @Inject() private userService: UserService;
  @Inject() private selectionService: SelectionService;
  @Inject() private streamingService: StreamingService;
  @Inject() private settingsService: SettingsService;

  static defaultState: IDualOutputServiceState = {
    dualOutputMode: false,
    videoSettings: {
      horizontal: null,
      vertical: verticalDisplayData, // get settings for horizontal display from obs directly
      activeDisplays: {
        horizontal: true,
        vertical: false,
      },
    },
    isLoading: false,
  };

  sceneNodeHandled = new Subject<number>();
  collectionHandled = new Subject<{ [sceneId: string]: Dictionary<string> } | null>();
  dualOutputModeChanged = new Subject<boolean>();

  get views() {
    return new DualOutputViews(this.state);
  }

  init() {
    super.init();

    // confirm custom destinations have a default display
    this.confirmDestinationDisplays();

    // Disable global Rescale Output
    this.disableGlobalRescaleIfNeeded();

    /**
     * Ensures that scene collection loads correctly for dual output
     * @remark This validates an existing scene collection, or converts a single output scene collection
     * to a dual output collection when a single output collection is loaded in dual output mode
     * @remark Optimize by only confirming when the collection is switched
     */
    this.sceneCollectionsService.collectionSwitched.subscribe(collection => {
      const hasNodeMap =
        collection?.sceneNodeMaps && Object.entries(collection?.sceneNodeMaps).length > 0;

      if (this.state.dualOutputMode && !hasNodeMap) {
        this.convertSingleOutputToDualOutputCollection();
      } else if (hasNodeMap) {
        this.validateDualOutputCollection();
      } else {
        this.collectionHandled.next(null);
      }
    });

    /**
     * Set loading state after a scene is switched
     * @remark This is necessary to turn off the loading state set when making the scene active
     */
    this.scenesService.sceneSwitched.subscribe(() => {
      if (this.state.isLoading) {
        this.setIsLoading(false);
      }
    });

    /**
     * Set loading state after a scene collection has been handled
     */
    this.collectionHandled.subscribe(() => {
      this.setIsLoading(false);
    });

    /**
     * The user must be logged in to use dual output mode
     * so toggle off dual output mode on log out.
     */
    this.userService.userLogout.subscribe(() => {
      if (this.state.dualOutputMode) {
        this.setDualOutputMode();
      }
    });
  }

  /**
   * Set Dual Output mode with side effects
   * @param status - Whether to enable or disable dual output mode
   * @param skipShowVideoSettings - Whether to skip showing the video settings window
   * @param showGoLiveWindow - Whether to show the go live window
   */
  @RunInLoadingMode()
  setDualOutputMode(
    status: boolean = true,
    skipShowVideoSettings: boolean = false,
    showGoLiveWindow?: boolean,
  ) {
    if (!this.userService.isLoggedIn) return;

    this.toggleDualOutputMode(status);

    if (this.state.dualOutputMode) {
      this.disableGlobalRescaleIfNeeded();

      // All dual output scene collections will have been validated when the collection was switched
      // so there is no need to validate the scene nodes again. So just convert the single output collection
      // to dual output if needed.
      if (!this.views.isDualOutputCollection) {
        this.convertSingleOutputToDualOutputCollection();
      }

      /**
       * Selective recording only works with horizontal sources, so don't show the
       * vertical display if toggling with selective recording active
       */
      if (!this.streamingService.state.selectiveRecording) {
        this.toggleDisplay(true, 'vertical');
      }
    } else {
      this.selectionService.views.globalSelection.reset();
    }

    if (!skipShowVideoSettings) {
      this.settingsService.showSettings('Video');
    } else if (showGoLiveWindow) {
      this.streamingService.showGoLiveWindow();
    }

    this.SET_IS_LOADING(false);
    this.dualOutputModeChanged.next(status);
  }

  /**
   * Toggle dual output mode
   * @remark Primarily a wrapper for the mutation to toggle dual output mode
   */
  toggleDualOutputMode(status: boolean) {
    this.SET_SHOW_DUAL_OUTPUT(status);
  }

  disableGlobalRescaleIfNeeded() {
    // TODO: this could be improved, either by state tracking or making it compatible with dual output
    // For now, disable global Rescale Output under Streaming if dual output is enabled
    if (this.state.dualOutputMode) {
      const output = this.settingsService.state.Output.formData;
      const globalRescaleOutput = this.settingsService.findSettingValue(
        output,
        'Streaming',
        'Rescale',
      );
      if (globalRescaleOutput) {
        // `Output` not a typo, it is different from above
        this.settingsService.setSettingValue('Output', 'Rescale', false);
        // TODO: find a cleaner way to make dual output recalculate its settings for the vertical display
        // since even after disabling "rescale output" its settings persists, and looks stretched.
        this.settingsService.refreshVideoSettings();
      }
    }
  }

  convertSingleOutputToDualOutputCollection() {
    this.SET_IS_LOADING(true);

    // establish vertical context if it doesn't exist
    this.videoSettingsService.validateVideoContext();

    try {
      // convert all scenes in the single output collection to dual output
      this.scenesService.views.scenes.forEach(scene => {
        this.createPartnerNodes(scene.id);
      });
    } catch (error: unknown) {
      console.error('Error converting to single output collection to dual output: ', error);
      this.collectionHandled.next();
    }

    this.collectionHandled.next(this.sceneCollectionsService.sceneNodeMaps);
  }

  createPartnerNodes(sceneId: string) {
    // the reordering of the nodes below is replicated from the copy nodes command
    const scene = this.scenesService.views.getScene(sceneId);
    const selection = new Selection(scene.id, scene.getNodes());
    const verticalNodes = [] as TSceneNode[];

    const initialNodeOrder = scene.getNodesIds();
    const nodeIdsMap: Dictionary<string> = {};

    selection.getNodes().forEach(node => {
      const verticalNode = this.createPartnerNode(node);
      nodeIdsMap[node.id] = verticalNode.id;
      verticalNodes.push(verticalNode);
    });

    // recreate parent/child relationships
    selection.getNodes().forEach(node => {
      const mappedNode = scene.getNode(nodeIdsMap[node.id]);
      const mappedParent = nodeIdsMap[node.parentId]
        ? scene.getNode(nodeIdsMap[node.parentId])
        : null;

      if (mappedParent) {
        mappedNode.setParent(mappedParent.id);
      }

      this.sceneNodeHandled.next();
    });

    const order = compact(scene.getNodesIds().map(origNodeId => nodeIdsMap[origNodeId]));
    scene.setNodesOrder(order.concat(initialNodeOrder));
  }

  /**
   * Create a partner node to show the source in the opposite display
   * @remark The horizontal node id is always the key in the scene node map.
   * @remark The node map entry is so that the horizontal and vertical nodes can refer to each other.
   * @param node - Node to copy to create a partner node to show the source in the opposite display
   * @param repair - Whether the node is being created in order to repair a dual output scene collection. Primarily used for setting visibility
   * @param partnerNodeId - Optional id for the partner node. For a horizontal node, it will be the vertical node id, and vice versa
   * @param sourceId - Optional source id for the horizontal node. Primarily used for repairing a vertical node that has a different source than the horizontal node. Both nodes should have the same source.
   *
   */
  createPartnerNode(
    node: TSceneNode,
    repair: boolean = false,
    partnerNodeId?: string,
    sourceId?: string,
  ): TSceneNode {
    const scene = node.getScene();
    const display = node.display === 'vertical' ? 'horizontal' : 'vertical';

    if (node.isFolder()) {
      // add folder and create node map entry
      const folder = scene.createFolder(node.name, {
        id: partnerNodeId,
        display,
      });

      // ensure correct ordering when creating a horizontal partner node for a vertical node
      if (display === 'horizontal') {
        this.sceneCollectionsService.createNodeMapEntry(scene.id, folder.id, node.id);
        folder.placeBefore(node.id);
      } else {
        this.sceneCollectionsService.createNodeMapEntry(scene.id, node.id, folder.id);
        folder.placeAfter(node.id);
      }

      return folder;
    } else {
      // add item
      const item = scene.addSource(sourceId ?? node.sourceId, {
        id: partnerNodeId,
        display,
        sourceAddOptions: { sourceId: sourceId ?? node.sourceId },
      });

      // ensure correct ordering when creating a horizontal partner node for a vertical node
      if (display === 'horizontal') {
        this.sceneCollectionsService.createNodeMapEntry(scene.id, item.id, node.id);
        item.placeBefore(node.id);
      } else {
        this.sceneCollectionsService.createNodeMapEntry(scene.id, node.id, item.id);
        item.placeAfter(node.id);
      }

      // position all of the nodes in the upper left corner of the vertical display
      // so that all of the sources are visible
      item.setTransform({ position: { x: 0, y: 0 } });

      // setting visibility is a little complex because of the different reasons for creating the partner node
      if (repair) {
        // by default, hide all horizontal scene items created to repair a dual output scene collection
        const visibility = item.display === 'horizontal' ? false : node.visible;
        item.setVisibility(visibility);
      } else {
        // by default, show all vertical scene items
        const visibility = item.display === 'vertical' ? true : node.visible;
        item.setVisibility(visibility);
      }

      // match locked
      item.setLocked(node.locked);

      return item;
    }
  }

  /**
   * Confirm scene node maps and scene nodes for dual output
   * @remark In order for nodes to reference each other, they must have an entry in the scene node map.
   * The scene node map is a dictionary where the key is the horizontal node id and the value is the
   * vertical node id. The scene node map is used to reference the vertical node from the horizontal node
   * and vice versa.
   * @remark Partner nodes are the node in the horizontal display and node in the vertical display that render
   * the same source in their respective displays. In order for the source to show in both displays, each node
   * must have a partner node.
   * @remark There is no circumstance where a vertical node should exist without a horizontal node.
   */
  validateDualOutputCollection() {
    this.SET_IS_LOADING(true);
    // establish vertical context if it doesn't exist
    this.videoSettingsService.validateVideoContext();

    try {
      this.scenesService.views.scenes.forEach(scene => {
        if (this.views.hasNodeMap(scene.id)) {
          this.validateSceneNodes(scene.id);
        } else {
          // if the scene is still a single output scene, convert it to dual output
          this.createPartnerNodes(scene.id);
        }
      });
    } catch (error: unknown) {
      console.error('Error validating dual output collection: ', error);
      this.collectionHandled.next();
    }
    this.collectionHandled.next(this.sceneCollectionsService.sceneNodeMaps);
  }

  /**
   * Assign or confirm node contexts to a dual output scene
   * @param sceneId - Id of the scene to map
   */
  validateSceneNodes(sceneId: string) {
    this.SET_IS_LOADING(true);
    const sceneNodes = this.scenesService.views.getSceneNodesBySceneId(sceneId);
    if (!sceneNodes) return;
    const corruptedNodeIds = new Set<string>();

    // Iterate over the scene nodes in reverse order to automatically handle correctly ordering
    // any nodes created as a part of the validation process. This optimizes validation by skipping
    // an extra loop over the nodes to reorder them.
    forEachRight(sceneNodes, (node: TSceneNode, index: number) => {
      // don't handle corrupted nodes
      if (corruptedNodeIds.has(node.id)) return;

      // confirm partner node exists
      const nodeMap =
        node?.display === 'vertical'
          ? invert(this.views.sceneNodeMaps[sceneId])
          : this.views.sceneNodeMaps[sceneId];
      const partnerNode = this.validatePartnerNode(node, nodeMap, sceneNodes);

      // confirm source and output for scene items
      if (node.isItem() && partnerNode.isItem()) {
        this.validateOutput(node, sceneId);
        const corruptedNode: SceneItem = this.validateSource(node, partnerNode);
        if (corruptedNode) {
          corruptedNodeIds.add(corruptedNode.id);
        }
      }

      this.sceneNodeHandled.next(index);
    });

    this.SET_IS_LOADING(false);
  }

  /**
   * Confirm the partner node exists for the node
   * @remark The partner node is the node in the opposite display that renders the same source in that display
   * @param node - The node to confirm the partner node for
   * @param sceneId - The id of the scene for both nodes
   * @param sceneNodes - An array of all nodes in the scene, both items and folders
   * @returns - The created partner node or the existing partner node
   */
  validatePartnerNode(
    node: TSceneNode,
    nodeMap: Dictionary<string>,
    sceneNodes: TSceneNode[],
  ): TSceneNode {
    const partnerNodeId = nodeMap[node.id];

    if (!partnerNodeId) {
      return this.createPartnerNode(node, node?.display === 'horizontal');
    }

    // corrupted scenes may be missing nodes
    const partnerNode = sceneNodes.find(node => node && node.id === partnerNodeId);

    if (!partnerNode) {
      return this.createPartnerNode(node, node?.display === 'horizontal', partnerNodeId);
    }

    return partnerNode;
  }

  /**
   * Confirm the source of the node matches the source of the partner node
   * @remark Primarily used for validating a scene collection on load. If they don't match, recreate the vertical node with the correct source.
   * @param node
   * @param partnerNode
   */
  validateSource(node: SceneItem, partnerNode: SceneItem): SceneItem {
    if (node.sourceId === partnerNode.sourceId) return;

    const horizontalNode = node.display === 'horizontal' ? node : partnerNode;
    const verticalNode = node.display === 'vertical' ? node : partnerNode;
    const matchVisibility = node.display === 'horizontal';
    const { visible, ...settings } = Object.assign(verticalNode.getSettings());
    const verticalNodeId = verticalNode.id;

    // remove old node
    this.sceneCollectionsService.removeNodeMapEntry(horizontalNode.id, horizontalNode.sceneId);
    verticalNode.remove();

    // create new node
    const newPartner = this.createPartnerNode(
      horizontalNode,
      matchVisibility,
      verticalNodeId,
      horizontalNode.sourceId,
    ) as SceneItem;
    const context = this.videoSettingsService.contexts[newPartner.display];
    newPartner.setSettings({ ...settings, output: context });
    newPartner.setVisibility(visible);

    return partnerNode;
  }

  /**
   * Confirm the node has an output assigned
   * @remark All nodes need to have an output assigned in order to be rendered in the displays
   * @param node - The node to confirm the output for
   * @param sceneId - The id of the scene for the node
   */
  validateOutput(node: SceneItem, sceneId: string) {
    if (node?.output) return;

    // assign an output to the node if it doesn't exist
    const verticalNodeIds = new Set(this.views.getVerticalNodeIds(sceneId));
    const display = verticalNodeIds.has(node.id) ? 'vertical' : 'horizontal';
    this.assignNodeContext(node, node?.display ?? display);
  }

  /**
   * Copy node or assign node context
   * @remark Currently, only the widget service needs to confirm the display,
   * all other function calls are to copy the horizontal node to a vertical node
   * @param sceneItem - the scene item to copy or assign context
   * @param display - the name of the context, which is also the display name
   * @param isHorizontalDisplay - whether this is the horizontal or vertical display
   * @param sceneId - the scene id where a copied node should be added, default is the active scene id
   * @returns
   */
  createOrAssignOutputNode(
    sceneItem: SceneItem,
    display: TDisplayType,
    isHorizontalDisplay: boolean,
    sceneId?: string,
    verticalNodeId?: string,
  ) {
    if (isHorizontalDisplay) {
      // if it's the first display, just assign the scene item's output to a context
      this.assignNodeContext(sceneItem, display);
      return sceneItem;
    } else {
      // if it's not the first display, copy the scene item
      const scene = this.scenesService.views.getScene(sceneId ?? this.views.activeSceneId);
      const copiedSceneItem = scene.addSource(sceneItem.sourceId, { id: verticalNodeId, display });

      if (!copiedSceneItem) return null;

      const selection = scene.getSelection(copiedSceneItem.id);
      this.editorCommandsService.executeCommand(
        'ReorderNodesCommand',
        selection,
        sceneItem.id,
        EPlaceType.Before,
      );

      this.sceneCollectionsService.createNodeMapEntry(sceneId, sceneItem.id, copiedSceneItem.id);
      return copiedSceneItem;
    }
  }

  assignNodeContext(node: TSceneNode, display: TDisplayType) {
    if (node.isItem()) {
      const context = this.videoSettingsService.contexts[display];
      if (!context) return null;
      node.setSettings({ output: context, display });
    } else {
      // because folders just group scene items, they do not have their own output value
      // set the display for toggling in the source selector
      node.setDisplay(display);
    }

    return node.id;
  }

  /**
   * Confirm custom destinations have assigned displays
   */

  confirmDestinationDisplays() {
    const customDestinations = this.streamSettingsService.settings.goLiveSettings
      ?.customDestinations;
    if (!customDestinations) return;

    customDestinations.forEach((destination: ICustomStreamDestination, index: number) => {
      if (!destination.hasOwnProperty('display')) {
        const updatedDestinations = customDestinations.splice(index, 1, {
          ...destination,
          display: 'horizontal',
        });
        this.streamSettingsService.setGoLiveSettings({ customDestinations: updatedDestinations });
      }
    });
  }

  /**
   * Show/hide displays
   *
   * @param status - Boolean visibility of display
   * @param display - Name of display
   */
  toggleDisplay(status: boolean, display: TDisplayType) {
    this.SET_DISPLAY_ACTIVE(status, display);
  }

  /**
   * Update Video Settings
   */

  setVideoSetting(setting: Partial<IVideoInfo>, display?: TDisplayType) {
    this.SET_VIDEO_SETTING(setting, display);
  }

  updateVideoSettings(settings: IVideoInfo, display: TDisplayType = 'horizontal') {
    this.UPDATE_VIDEO_SETTING(settings, display);
  }

  setIsLoading(status: boolean) {
    this.SET_IS_LOADING(status);
  }

  @mutation()
  private SET_SHOW_DUAL_OUTPUT(status?: boolean) {
    this.state = {
      ...this.state,
      dualOutputMode: status ?? !this.state.dualOutputMode,
    };
  }

  @mutation()
  private SET_DISPLAY_ACTIVE(status: boolean, display: TDisplayType) {
    this.state.videoSettings.activeDisplays = {
      ...this.state.videoSettings.activeDisplays,
      [display]: status,
    };
  }

  @mutation()
  private SET_VIDEO_SETTING(setting: Partial<IVideoInfo>, display: TDisplayType = 'vertical') {
    this.state.videoSettings[display] = {
      ...this.state.videoSettings[display],
      ...setting,
    };
  }

  @mutation()
  private UPDATE_VIDEO_SETTING(setting: IVideoInfo, display: TDisplayType = 'vertical') {
    this.state.videoSettings[display] = { ...setting };
  }

  @mutation()
  private SET_IS_LOADING(status: boolean) {
    this.state = { ...this.state, isLoading: status };
  }
}
