import type { Scene } from 'services/scenes';

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
