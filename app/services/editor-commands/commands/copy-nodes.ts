import { Command } from './command';
import { Selection } from 'services/selection';
import { Inject } from 'services/core';
import { ScenesService, TSceneNode } from 'services/scenes';
import compact from 'lodash/compact';
import { $t } from 'services/i18n';
import { DualOutputService } from 'services/dual-output';
import { TDisplayType, VideoService } from 'services/video';
import { EditorService } from 'services/editor';
import { SceneCollectionsService } from 'services/scene-collections';
import { cloneDeep } from 'lodash';

/**
 * Copies nodes
 *
 * @remarks
 * The copy nodes editor command has small variations when working with:
 *  - a vanilla scene
 *  - a dual output scene
 *  - migrating a vanilla scene to a dual output scene
 * To maximize readability, the code for this is not very DRY.
 *
 *  @param selection - The selection of nodes to copy
 *  @param destSceneId - The scene to copy the nodes to
 *  @param duplicateSources - Boolean for whether the sources should be copied
 *  @param display - Optional, the display to assign the copied nodes to
 */
export class CopyNodesCommand extends Command {
  @Inject() scenesService: ScenesService;
  @Inject() dualOutputService: DualOutputService;
  @Inject() videoService: VideoService;
  @Inject() editorService: EditorService;
  @Inject() sceneCollectionsService: SceneCollectionsService;

  description: string;

  /**
   * Maps original source ids to new source ids for deterministic
   * generation of of sources with consistent ids.
   */
  private sourceIdsMap: Dictionary<string>;

  /**
   * Maps original node ids to new node ids for deterministic
   * generation of of sources with consistent ids.
   */
  private nodeIdsMap: Dictionary<string> = {};

  private hasNodeMap: boolean;

  constructor(
    private selection: Selection,
    private destSceneId: string,
    private duplicateSources = false,
    private display?: TDisplayType,
  ) {
    super();
    this.selection.freeze();
    const nodes = this.selection.getNodes();
    this.description = $t('Paste %{nodeName}', { nodeName: nodes[0] ? nodes[0].name : '' });
    this.hasNodeMap = this.dualOutputService.views.hasNodeMap(this.selection.sceneId);
  }

  execute() {
    const scene = this.scenesService.views.getScene(this.destSceneId);
    const insertedNodes: TSceneNode[] = [];

    const initialNodeOrder = scene.getNodesIds();

    const isDualOutputMode = this.dualOutputService.views.dualOutputMode;

    // Duplicate necessary sources if needed
    if (this.duplicateSources) {
      this.sourceIdsMap = {};

      this.selection.getSources().forEach(source => {
        const dup = source.duplicate(this.sourceIdsMap[source.sourceId]);

        // If the source was marked as do-not-duplicate, dup will be null
        // In this case, use the original source
        this.sourceIdsMap[source.sourceId] = dup ? dup.sourceId : source.sourceId;
      });
    }

    /**
     * If the scene does not already have a node map it is a vanilla scene.
     * If dual output mode is on, copy all of the nodes and create a scene node map
     * to migrate the vanilla scene to a dual output scene.
     *
     * Otherwise, just copy all of the nodes without creating a node map regardless of.
     * Whether or not it's a vanilla or dual output scene. The node map for dual output
     * scenes will be handled when reordering the nodes.
     */
    if (isDualOutputMode && !this.hasNodeMap) {
      // Create all nodes first
      this.selection.getNodes().forEach(node => {
        if (node.isFolder()) {
          // add folder
          const display =
            this.display ??
            this.dualOutputService.views.getNodeDisplay(node.id, this.selection.sceneId);

          const folder = scene.createFolder(node.name, { id: this.nodeIdsMap[node.id], display });

          // if needed, create node map entry
          if (this.display === 'vertical') {
            // when creating dual output nodes for a vanilla scene, the passed in display is set to vertical
            // if the scene has dual output nodes, add a node map entry only when copying a horizontal node
            this.sceneCollectionsService.createNodeMapEntry(this.destSceneId, node.id, folder.id);
          }

          this.nodeIdsMap[node.id] = folder.id;
          insertedNodes.push(folder);
        } else {
          // add item
          const itemDisplay =
            this.display ??
            this.dualOutputService.views.getNodeDisplay(node.id, this.selection.sceneId);

          const sourceId =
            this.sourceIdsMap != null ? this.sourceIdsMap[node.sourceId] : node.sourceId;
          const item = scene.addSource(sourceId, {
            id: this.nodeIdsMap[node.id],
            display: itemDisplay,
          });

          // if needed, create node map entry
          if (this.display === 'vertical') {
            // position all of the nodes in the upper left corner of the vertical display
            // so that all of the sources are visible
            item.setTransform({ position: { x: 0, y: 0 } });

            // show all vertical scene items by default
            item.setVisibility(true);

            item.setLocked(node.locked);

            // when creating dual output scene nodes, the passed in display is set to vertical
            // if the scene has dual output nodes, add a node map entry only when copying a horizontal node
            this.sceneCollectionsService.createNodeMapEntry(this.destSceneId, node.id, item.id);
          } else {
            // apply origin scene item settings to copied scene item
            const { display, output, ...settings } = node.getSettings();
            item.setSettings(settings);
          }

          // add to arrays for reordering
          this.nodeIdsMap[node.id] = item.id;
          insertedNodes.push(item);
        }
      });

      this.hasNodeMap = true;
    } else {
      this.selection.getNodes().forEach(node => {
        if (node.isFolder()) {
          // add folder
          const display =
            this.display ??
            this.dualOutputService.views.getNodeDisplay(node.id, this.selection.sceneId);

          const folder = scene.createFolder(node.name, { id: this.nodeIdsMap[node.id], display });

          this.nodeIdsMap[node.id] = folder.id;
          insertedNodes.push(folder);
        } else {
          // add item
          const itemDisplay =
            this.display ??
            this.dualOutputService.views.getNodeDisplay(node.id, this.selection.sceneId);

          const sourceId =
            this.sourceIdsMap != null ? this.sourceIdsMap[node.sourceId] : node.sourceId;
          const item = scene.addSource(sourceId, {
            id: this.nodeIdsMap[node.id],
            display: itemDisplay,
          });

          // apply origin scene item settings to copied scene item
          const { display, output, ...settings } = node.getSettings();
          item.setSettings(settings);

          // add to arrays for reordering
          this.nodeIdsMap[node.id] = item.id;
          insertedNodes.push(item);
        }
      });
    }

    // Recreate parent/child relationships
    this.selection.getNodes().forEach(node => {
      const mappedNode = scene.getNode(this.nodeIdsMap[node.id]);
      const mappedParent = this.nodeIdsMap[node.parentId]
        ? scene.getNode(this.nodeIdsMap[node.parentId])
        : null;

      if (mappedParent) {
        mappedNode.setParent(mappedParent.id);
      }
    });

    // Recreate node order
    // Selection does not have canonical node order - scene does
    if (this.hasNodeMap) {
      // for dual output scenes, create node map while reordering nodes
      const order = compact(
        this.selection
          .getScene()
          .getNodesIds()
          .map(origNodeId => {
            if (
              this.dualOutputService.views.getNodeDisplay(origNodeId, this.selection.sceneId) ===
              'horizontal'
            ) {
              // determine if node is horizontal in original scene and get vertical node
              const origVerticalNodeId = this.dualOutputService.views.getVerticalNodeId(
                origNodeId,
                this.selection.sceneId,
              );
              const newHorizontalNodeId = this.nodeIdsMap[origNodeId];
              const newVerticalNodeId = this.nodeIdsMap[origVerticalNodeId];

              this.sceneCollectionsService.createNodeMapEntry(
                this.destSceneId,
                newHorizontalNodeId,
                newVerticalNodeId,
              );
            }
            return this.nodeIdsMap[origNodeId];
          }),
      );
      scene.setNodesOrder(order.concat(initialNodeOrder));
    } else {
      const order = compact(
        this.selection
          .getScene()
          .getNodesIds()
          .map(origNodeId => this.nodeIdsMap[origNodeId]),
      );
      scene.setNodesOrder(order.concat(initialNodeOrder));
    }

    return insertedNodes;
  }

  rollback() {
    // Rolling back this operation is as simple as removing all created items.
    // Any duplicated sources will be automatically deleted as the last scene
    // item referencing them is removed.
    const scene = this.scenesService.views.getScene(this.destSceneId);

    Object.values(this.nodeIdsMap).forEach(nodeId => {
      const node = scene.getNode(nodeId);
      if (node) node.remove();

      if (this.dualOutputService.views.hasNodeMap(scene.id)) {
        this.sceneCollectionsService.removeNodeMapEntry(nodeId, scene.id);
      }
    });
  }
}
