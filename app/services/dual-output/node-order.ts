import type { Scene, TSceneNode } from 'services/scenes';

export type TValidatedNodeOrder =
  | { isValid: true; nodeIds: string[] }
  | { isValid: false; reason: string };

/**
 * Group dual-output nodes by display without changing either display's z-order.
 * Scene nodes are stored from top to bottom, so the filters below are stable.
 */
export function orderNodesByDisplay(scene: Scene) {
  const nodes = scene.getNodes();
  const horizontalNodeIds = nodes.filter(node => node.display !== 'vertical').map(node => node.id);
  const verticalNodeIds = nodes.filter(node => node.display === 'vertical').map(node => node.id);
  const orderedNodeIds = horizontalNodeIds.concat(verticalNodeIds);

  if (orderedNodeIds.every((nodeId, index) => nodeId === nodes[index].id)) return;

  scene.setNodesOrder(orderedNodeIds);
}

/**
 * Build the canonical order for a persisted dual-output scene.
 *
 * Horizontal nodes are the authored order shown in the source selector. The
 * vertical order is derived from that order through the node map rather than
 * preserving a potentially corrupted persisted vertical order.
 */
export function getValidatedDualOutputNodeOrder(
  scene: Scene,
  nodeMap?: Dictionary<string>,
): TValidatedNodeOrder {
  if (!nodeMap) return { isValid: false, reason: 'the scene has no node map' };

  const nodes = scene.getNodes();
  const nodesById = new Map<string, TSceneNode>();

  nodes.forEach(node => nodesById.set(node.id, node));
  if (nodesById.size !== nodes.length) {
    return { isValid: false, reason: 'the scene contains duplicate node ids' };
  }

  const pairs = Object.entries(nodeMap);
  const pairedNodeIds = new Set<string>();

  for (const [horizontalNodeId, verticalNodeId] of pairs) {
    if (pairedNodeIds.has(horizontalNodeId) || pairedNodeIds.has(verticalNodeId)) {
      return { isValid: false, reason: 'the node map is not one-to-one' };
    }

    const horizontalNode = nodesById.get(horizontalNodeId);
    const verticalNode = nodesById.get(verticalNodeId);
    if (!horizontalNode || !verticalNode) {
      return { isValid: false, reason: 'the node map references a missing scene node' };
    }
    if (horizontalNode.display !== 'horizontal' || verticalNode.display !== 'vertical') {
      return { isValid: false, reason: 'a mapped node has the wrong display' };
    }
    if (horizontalNode.sceneNodeType !== verticalNode.sceneNodeType) {
      return { isValid: false, reason: 'mapped nodes have different node types' };
    }
    if (
      horizontalNode.isItem() &&
      verticalNode.isItem() &&
      horizontalNode.sourceId !== verticalNode.sourceId
    ) {
      return { isValid: false, reason: 'mapped items reference different sources' };
    }

    pairedNodeIds.add(horizontalNodeId);
    pairedNodeIds.add(verticalNodeId);
  }

  if (pairedNodeIds.size !== nodes.length) {
    return { isValid: false, reason: 'the node map does not cover every scene node' };
  }

  const horizontalNodes = nodes.filter(node => node.display === 'horizontal');
  const horizontalNodeIds = new Set(horizontalNodes.map(node => node.id));
  const ancestorsByNodeId = new Map<string, Set<string>>();

  for (const node of horizontalNodes) {
    const ancestors = new Set<string>();
    let parentId = node.parentId;

    while (parentId) {
      if (ancestors.has(parentId) || parentId === node.id) {
        return { isValid: false, reason: 'the horizontal folder hierarchy contains a cycle' };
      }

      const parent = nodesById.get(parentId);
      if (!parent || !horizontalNodeIds.has(parentId) || !parent.isFolder()) {
        return { isValid: false, reason: 'a horizontal node has an invalid parent' };
      }

      ancestors.add(parentId);
      parentId = parent.parentId;
    }

    ancestorsByNodeId.set(node.id, ancestors);

    const verticalNode = nodesById.get(nodeMap[node.id])!;
    const expectedVerticalParentId = node.parentId ? nodeMap[node.parentId] : '';
    if ((verticalNode.parentId || '') !== (expectedVerticalParentId || '')) {
      return { isValid: false, reason: 'mapped nodes do not have mirrored parents' };
    }
  }

  for (let folderIndex = 0; folderIndex < horizontalNodes.length; folderIndex++) {
    const folder = horizontalNodes[folderIndex];
    if (!folder.isFolder()) continue;

    const descendantIndices = horizontalNodes.reduce((indices, node, nodeIndex) => {
      if (ancestorsByNodeId.get(node.id)!.has(folder.id)) indices.push(nodeIndex);
      return indices;
    }, [] as number[]);

    if (
      descendantIndices.some((nodeIndex, descendantIndex) => {
        return nodeIndex !== folderIndex + descendantIndex + 1;
      })
    ) {
      return {
        isValid: false,
        reason: 'the horizontal folder hierarchy is not depth-first and contiguous',
      };
    }
  }

  const horizontalOrder = horizontalNodes.map(node => node.id);
  return {
    isValid: true,
    nodeIds: horizontalOrder.concat(horizontalOrder.map(nodeId => nodeMap[nodeId])),
  };
}
