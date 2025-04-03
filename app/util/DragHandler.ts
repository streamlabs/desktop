import { SettingsService } from 'services/settings';
import { Inject } from 'services/core/injector';
import { SceneItem } from 'services/scenes';
import { VideoService } from 'services/video';
import { WindowsService } from 'services/windows';
import { DualOutputService } from 'services/dual-output';
import { ScalableRectangle } from 'util/ScalableRectangle';
import { SelectionService } from 'services/selection';
import { EditorCommandsService } from 'services/editor-commands';
import { IMouseEvent } from 'services/editor';
import { byOS, OS } from './operating-systems';

/*
 * An edge looks like:
 * ________________________________
 * |                ^
 * |                |
 * |      offset -> |
 * |                |
 * |                v
 * |     depth      /\ ^
 * |<-------------->|| |
 * |                || |
 * |        edge -> || | <- length
 * |                || |
 * |                || |
 * |                \/ v
 *
 * An edge can be horizontal or vertical, but only alike
 * types make sense to compare to each other.
 */
interface IEdge {
  depth: number;
  offset: number;
  length: number;
}

// A set of edges separated by location
interface IEdgeCollection {
  top: IEdge[];
  bottom: IEdge[];
  left: IEdge[];
  right: IEdge[];
}

interface ISourceEdges {
  top: IEdge;
  bottom: IEdge;
  left: IEdge;
  right: IEdge;
}

interface IDragHandlerOptions {
  displaySize: IVec2;
  displayOffset: IVec2;
}

// Encapsulates logic for dragging sources in the overlay editor
export class DragHandler {
  @Inject() private settingsService: SettingsService;
  @Inject() private videoService: VideoService;
  @Inject() private windowsService: WindowsService;
  @Inject() private selectionService: SelectionService;
  @Inject() private editorCommandsService: EditorCommandsService;
  @Inject() private dualOutputService: DualOutputService;

  // Settings
  snapEnabled: boolean;
  renderedSnapDistance: number;
  screenSnapping: boolean;
  sourceSnapping: boolean;
  centerSnapping: boolean;

  // Video Canvas
  baseWidth: number;
  baseHeight: number;
  displaySize: IVec2;
  displayOffset: IVec2;
  scaleFactor: number;
  snapDistance: number;

  // Sources
  private draggedSource: SceneItem;
  private otherSources: SceneItem[];

  // Mouse properties
  mouseOffset: IVec2 = { x: 0, y: 0 };

  targetEdges: IEdgeCollection;

  /**
   * @param startEvent the mouse event for this drag
   * @param options drag handler options
   */

  constructor(startEvent: IMouseEvent, options: IDragHandlerOptions) {
    // Load some settings we care about
    this.snapEnabled = this.settingsService.views.values.General.SnappingEnabled;
    this.renderedSnapDistance = this.settingsService.views.values.General.SnapDistance;
    this.screenSnapping = this.settingsService.views.values.General.ScreenSnapping;
    this.sourceSnapping = this.settingsService.views.values.General.SourceSnapping;
    this.centerSnapping = this.settingsService.views.values.General.CenterSnapping;

    // Load some attributes about the video canvas
    const baseRes = this.videoService.baseResolutions[startEvent.display];
    this.baseWidth = baseRes.baseWidth;
    this.baseHeight = baseRes.baseHeight;

    this.displaySize = options.displaySize;
    this.displayOffset = options.displayOffset;

    // We don't need to adjust mac coordinates for scale factor
    this.scaleFactor = byOS({
      [OS.Windows]: this.windowsService.state.main.scaleFactor,
      [OS.Mac]: 1,
    });

    this.snapDistance =
      (this.renderedSnapDistance * this.scaleFactor * this.baseWidth) / this.displaySize.x;

    // Load some attributes about sources
    const lastDragged = this.selectionService.views.globalSelection.getLastSelected();

    if (lastDragged.isItem()) {
      /**
       * In dual output mode, the last selected node may be in a different display than the mouse event.
       * Dragging scene items in the display should only transform the nodes in the display with the mouse event.
       * So if the displays for the mouse event and last selected node don't match, use the node's partner
       * in the other display.
       *
       * If there are any issues finding the partner node, use the last dragged source as a default.
       * While it's not ideal, this will prevent errors from attempting to work with undefined values.
       */
      if (startEvent.display !== lastDragged.display) {
        const dualOutputNodeId = this.dualOutputService.views.getDualOutputNodeId(lastDragged.id);
        // confirm the partner id was found
        if (dualOutputNodeId) {
          const dualOutputNode = this.selectionService.views.globalSelection
            .getItems()
            .find(item => item.id === dualOutputNodeId);

          // confirm the partner node was found, or use the last selected node as a default
          this.draggedSource = dualOutputNode ?? lastDragged;
        } else {
          this.draggedSource = lastDragged;
        }
      } else {
        this.draggedSource = lastDragged;
      }
    }

    this.otherSources = this.selectionService.views.globalSelection
      .clone()
      .invert()
      .getItems()
      .filter(item => item.isVisualSource);

    const rect = new ScalableRectangle(this.draggedSource.rectangle);
    rect.normalize();

    const pos = this.mousePositionInCanvasSpace(startEvent);

    this.mouseOffset.x = pos.x - rect.x;
    this.mouseOffset.y = pos.y - rect.y;

    // Generate the edges we should snap to
    this.targetEdges = this.generateTargetEdges();
  }

  /**
   * Should be called when the mouse moves
   * @remark In dual output mode, scene items are prevented
   * from moving outside of the editor display. We return a boolean
   * to show an error message in the notifications component,
   * which is emitted by the studio editor component.
   *
   * @param event - Mouseevent for repositioning the scene item
   * @returns - boolean with whether or not the mouse move was stopped
   */
  //
  move(event: IMouseEvent) {
    const rect = new ScalableRectangle(this.draggedSource.rectangle);
    const denormalize = rect.normalize();

    const mousePos = this.mousePositionInCanvasSpace(event);

    // Move the rectangle to its new position
    rect.x = mousePos.x - this.mouseOffset.x;
    rect.y = mousePos.y - this.mouseOffset.y;

    /**
     * In dual output mode, prevent sources from being dragged outside of the canvas
     * and show an error message when they are dragged too far out
     */
    if (this.dualOutputService.views.dualOutputMode) {
      rect.normalize();

      const dragBoundaries = {
        left: -rect.scaledWidth - this.displayOffset.x,
        top: -rect.scaledHeight - this.displayOffset.y,
        right: this.baseWidth + this.displayOffset.x,
        bottom: this.baseHeight + this.displayOffset.y,
      };

      if (rect.x < 0 && rect.x <= dragBoundaries.left) {
        rect.x = dragBoundaries.left + 0.5;
        return true;
      } else if (rect.y < 0 && rect.y <= dragBoundaries.top) {
        rect.y = dragBoundaries.top + 0.5;
        return true;
      } else if (rect.x >= dragBoundaries.right) {
        rect.x = dragBoundaries.right - 0.5;
        return true;
      } else if (rect.y >= dragBoundaries.bottom) {
        rect.y = dragBoundaries.bottom - 0.5;
        return true;
      }
    }

    /**
     * Adjust position for snapping
     * Holding Ctrl temporary disables snapping
     */
    if (this.snapEnabled && !event.ctrlKey) {
      const sourceEdges = this.generateSourceEdges(rect);

      const leftDistance = this.getNearestEdgeDistance(sourceEdges.left, this.targetEdges.left);
      const rightDistance = this.getNearestEdgeDistance(sourceEdges.right, this.targetEdges.right);
      const topDistance = this.getNearestEdgeDistance(sourceEdges.top, this.targetEdges.top);
      const bottomDistance = this.getNearestEdgeDistance(
        sourceEdges.bottom,
        this.targetEdges.bottom,
      );

      let snapDistanceX = 0;
      let snapDistanceY = 0;

      if (Math.abs(leftDistance) <= Math.abs(rightDistance)) {
        if (Math.abs(leftDistance) < this.snapDistance) snapDistanceX = leftDistance;
      } else {
        if (Math.abs(rightDistance) < this.snapDistance) snapDistanceX = rightDistance;
      }

      if (Math.abs(topDistance) <= Math.abs(bottomDistance)) {
        if (Math.abs(topDistance) < this.snapDistance) snapDistanceY = topDistance;
      } else {
        if (Math.abs(bottomDistance) < this.snapDistance) snapDistanceY = bottomDistance;
      }

      rect.x += snapDistanceX;
      rect.y += snapDistanceY;
    }

    denormalize();

    /**
     * Translate new position into a delta that can be applied
     * to all selected sources equally.
     */
    const deltaX = rect.x - this.draggedSource.transform.position.x;
    const deltaY = rect.y - this.draggedSource.transform.position.y;

    this.editorCommandsService.executeCommand(
      'MoveItemsCommand',
      this.selectionService.views.globalSelection,
      { x: deltaX, y: deltaY },
      event.display,
    );

    return false;
  }

  private mousePositionInCanvasSpace(event: IMouseEvent): IVec2 {
    return this.pageSpaceToCanvasSpace(
      {
        x: event.pageX - this.displayOffset.x,
        y: event.pageY - this.displayOffset.y,
      },
      event.display,
    );
  }

  private pageSpaceToCanvasSpace(vec: IVec2, display = 'horizontal') {
    const baseWidth = this.videoService.baseResolutions[display].baseWidth;
    const baseHeight = this.videoService.baseResolutions[display].baseHeight;
    return {
      x: (vec.x * this.scaleFactor * baseWidth) / this.displaySize.x,
      y: (vec.y * this.scaleFactor * baseHeight) / this.displaySize.y,
    };
  }

  /**
   * Returns true if 2 edges overlap
   * @param a an edge
   * @param b another edge
   */
  private edgesOverlap(a: IEdge, b: IEdge): boolean {
    if (a.offset + a.length < b.offset) {
      return false;
    }

    if (b.offset + b.length < a.offset) {
      return false;
    }

    return true;
  }

  private getNearestEdgeDistance(sourceEdge: IEdge, targetEdges: IEdge[]) {
    let minDistance = Infinity;

    targetEdges.forEach(targetEdge => {
      if (!this.edgesOverlap(targetEdge, sourceEdge)) return;

      const distance = targetEdge.depth - sourceEdge.depth;

      if (Math.abs(distance) < Math.abs(minDistance)) {
        minDistance = distance;
      }
    });

    return minDistance;
  }

  /**
   * Generates the target edges, which are edges that the
   * currently dragged source can snap to.  They are separated
   * by which edge of the source can snap to it.
   */
  private generateTargetEdges() {
    const targetEdges: IEdgeCollection = {
      left: [],
      top: [],
      right: [],
      bottom: [],
    };

    // Screen edge snapping:
    if (this.screenSnapping) {
      // Screen left
      targetEdges.left.push({
        depth: 0,
        offset: 0,
        length: this.baseHeight,
      });

      // Screen top
      targetEdges.top.push({
        depth: 0,
        offset: 0,
        length: this.baseWidth,
      });

      // Screen right
      targetEdges.right.push({
        depth: this.baseWidth,
        offset: 0,
        length: this.baseHeight,
      });

      // Screen bottom
      targetEdges.bottom.push({
        depth: this.baseHeight,
        offset: 0,
        length: this.baseWidth,
      });
    }

    // Source edge snapping:
    if (this.sourceSnapping) {
      this.otherSources.forEach(source => {
        const edges = this.generateSourceEdges(new ScalableRectangle(source.rectangle));

        // The dragged source snaps to the adjacent edge
        // of other sources.  So the right edge snaps to
        // the left edge of other sources, etc.
        targetEdges.left.push(edges.right);
        targetEdges.top.push(edges.bottom);
        targetEdges.right.push(edges.left);
        targetEdges.bottom.push(edges.top);
      });
    }

    return targetEdges;
  }

  /**
   * Generates edges for the given source at
   * the given x & y coordinates
   */
  private generateSourceEdges(source: IScalableRectangle): ISourceEdges {
    const rect = new ScalableRectangle({
      x: source.x,
      y: source.y,
      width: source.width,
      height: source.height,
      scaleX: source.scaleX,
      scaleY: source.scaleY,
      crop: source.crop,
      rotation: source.rotation,
    });

    rect.normalize();

    return {
      left: {
        depth: rect.x,
        offset: rect.y,
        length: rect.scaledHeight,
      },

      top: {
        depth: rect.y,
        offset: rect.x,
        length: rect.scaledWidth,
      },

      right: {
        depth: rect.x + rect.scaledWidth,
        offset: rect.y,
        length: rect.scaledHeight,
      },

      bottom: {
        depth: rect.y + rect.scaledHeight,
        offset: rect.x,
        length: rect.scaledWidth,
      },
    };
  }
}
