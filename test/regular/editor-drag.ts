import { test, useWebdriver } from '../helpers/webdriver';
import { focusMain, focusWindow } from '../helpers/modules/core';

interface IDragGeometry {
  position: IVec2;
  scale: IVec2;
}

interface IFolderDragResult {
  original: IVec2[];
  afterOtherCanvasMove: IVec2[];
  moved: IVec2[];
  undone: IVec2[];
  redone: IVec2[];
  started: boolean;
  stopped: boolean;
  lastSelectedIsEmptyPartner: boolean;
  selectedBefore: string[];
  selectedAfter: string[];
  resize: {
    started: boolean;
    before: IDragGeometry;
    resized: IDragGeometry;
    undone: IDragGeometry;
    horizontalBefore: IDragGeometry;
    horizontalAfter: IDragGeometry;
  };
}

interface IDragStartupResult {
  noops: Array<{
    label: string;
    idle: boolean;
    requestsEnabled: boolean;
    selectionUnchanged: boolean;
    historyUnchanged: boolean;
  }>;
  started: boolean;
  stopped: boolean;
  selected: string[];
  verticalId: string;
  before: IVec2;
  moved: IVec2;
  undone: IVec2;
}

// Not a React hook.
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver({ restartAppAfterEachTest: false });

test('Dragging a paired folder uses the hovered canvas item and supports undo', async t => {
  t.true(await focusWindow('worker'), 'worker window is available');
  try {
    const result = await t.context.app.client.execute<IFolderDragResult, []>(`
      return (() => {
        const services = window.servicesManager;
        const scenes = services.getResource('ScenesService');
        const selection = services.getResource('SelectionService');
        const editor = services.getResource('EditorService');
        const commands = services.getResource('EditorCommandsService');
        const video = services.getResource('VideoSettingsService');
        const windows = services.getResource('WindowsService');
        const scene = scenes.createScene('Folder drag regression', { makeActive: true });
        const horizontal = scene.createAndAddSource('Drag horizontal', 'color_source', {
          width: 80, height: 80,
        }, { select: false });
        const vertical = scene.addSource(horizontal.sourceId, { display: 'vertical', select: false });
        const horizontal2 = scene.addSource(horizontal.sourceId, { select: false });
        const vertical2 = scene.addSource(horizontal.sourceId, { display: 'vertical', select: false });
        const folder = scene.createFolder('Imported folder');
        const emptyPartner = scene.createFolder('Imported folder', { display: 'vertical' });
        [horizontal, horizontal2, vertical, vertical2].forEach(item => item.setParent(folder.id));
        [horizontal, vertical].forEach(item => item.setTransform({ position: { x: 100, y: 100 } }));
        [horizontal2, vertical2].forEach(item => item.setTransform({ position: { x: 220, y: 100 } }));
        const positions = () => [horizontal, horizontal2, vertical, vertical2].map(item => ({
          ...item.transform.position,
        }));
        const original = positions();
        const oldDimensions = {
          widths: { ...editor.renderedWidths }, heights: { ...editor.renderedHeights },
          xs: { ...editor.renderedOffsetXs }, ys: { ...editor.renderedOffsetYs },
        };
        const event = (x, y, buttons = 1) => ({
          offsetX: x, offsetY: y, pageX: x, pageY: y, display: 'vertical',
          button: 0, buttons, ctrlKey: true, shiftKey: false, altKey: false, metaKey: false,
        });
        try {
          const factor = process.platform === 'win32' ? windows.state.main.scaleFactor : 1;
          const resolution = video.baseResolutions.vertical;
          editor.handleOutputResize({ x: 0, y: 0,
            width: resolution.baseWidth * factor, height: resolution.baseHeight * factor,
          }, 'vertical');
          selection.select([folder.id, emptyPartner.id]);
          const lastSelectedIsEmptyPartner = selection.views.globalSelection.getLastSelected().id === emptyPartner.id;
          const selectedBefore = selection.views.globalSelection.getIds();
          editor.handleMouseDown(event(140, 140));
          editor.handleMouseMove(event(140, 140));
          const started = !!editor.dragHandler && editor.state.changingPositionInProgress;
          editor.handleMouseMove({ ...event(300, 250), display: 'horizontal' });
          const afterOtherCanvasMove = positions();
          editor.handleMouseMove(event(170, 170));
          editor.handleMouseUp(event(170, 170, 0));
          const moved = positions();
          const selectedAfter = selection.views.globalSelection.getIds();
          commands.undo();
          const undone = positions();
          commands.redo();
          const redone = positions();

          const nextScene = scenes.createScene('Resize after folder drag', { makeActive: true });
          const nextHorizontal = nextScene.addSource(horizontal.sourceId, { select: false });
          const nextVertical = nextScene.addSource(horizontal.sourceId, { display: 'vertical', select: false });
          nextVertical.setTransform({ position: { x: 100, y: 100 } });
          const geometry = item => ({
            position: { ...item.transform.position }, scale: { ...item.transform.scale },
          });
          const resizeBefore = geometry(nextVertical);
          const horizontalBefore = geometry(nextHorizontal);
          selection.select([nextVertical.id]);
          editor.handleMouseDown(event(180, 180));
          const resizeStarted = !!editor.resizeRegion && editor.state.changingPositionInProgress;
          editor.handleMouseMove(event(210, 210));
          editor.handleMouseUp(event(210, 210, 0));
          const resized = geometry(nextVertical);
          const horizontalAfter = geometry(nextHorizontal);
          commands.undo();

          return { original, afterOtherCanvasMove, moved, undone, redone, started,
            lastSelectedIsEmptyPartner,
            selectedBefore: [...new Set(selectedBefore)].sort(),
            selectedAfter: [...new Set(selectedAfter)].sort(),
            stopped: !editor.dragHandler && !editor.state.changingPositionInProgress,
            resize: { started: resizeStarted, before: resizeBefore, resized,
              undone: geometry(nextVertical), horizontalBefore, horizontalAfter,
            },
          };
        } finally {
          if (editor.dragHandler || editor.resizeRegion) editor.handleMouseUp(event(170, 170, 0));
          Object.assign(editor.renderedWidths, oldDimensions.widths);
          Object.assign(editor.renderedHeights, oldDimensions.heights);
          Object.assign(editor.renderedOffsetXs, oldDimensions.xs);
          Object.assign(editor.renderedOffsetYs, oldDimensions.ys);
        }
      })();
    `);

    t.true(result.lastSelectedIsEmptyPartner, 'fixture reproduces the empty final folder');
    t.true(result.started);
    t.true(result.stopped);
    t.deepEqual(
      result.afterOtherCanvasMove,
      result.original,
      'other canvas events do not move either selection',
    );
    t.deepEqual(result.selectedAfter, result.selectedBefore, 'folder selection is preserved');
    t.deepEqual(result.moved.slice(0, 2), result.original.slice(0, 2), 'horizontal items stay put');
    result.moved.slice(2).forEach((position: IVec2, index: number) => {
      t.true(Math.abs(position.x - result.original[index + 2].x - 30) < 0.01);
      t.true(Math.abs(position.y - result.original[index + 2].y - 30) < 0.01);
    });
    t.deepEqual(result.undone, result.original);
    t.deepEqual(result.redone, result.moved);
    t.true(result.resize.started, 'resize starts after switching away from the folder scene');
    t.true(result.resize.resized.scale.x > result.resize.before.scale.x);
    t.true(result.resize.resized.scale.y > result.resize.before.scale.y);
    t.deepEqual(result.resize.horizontalAfter, result.resize.horizontalBefore);
    t.deepEqual(result.resize.undone, result.resize.before);
  } finally {
    await focusMain();
  }
});

test('Drag startup ignores ineligible anchors and still supports a first-click selection', async t => {
  t.true(await focusWindow('worker'), 'worker window is available');
  try {
    const result = await t.context.app.client.execute<IDragStartupResult, []>(`
      return (() => {
        const services = window.servicesManager;
        const scenes = services.getResource('ScenesService');
        const selection = services.getResource('SelectionService');
        const editor = services.getResource('EditorService');
        const tcp = services.getResource('TcpServerService');
        const commands = services.getResource('EditorCommandsService');
        const video = services.getResource('VideoSettingsService');
        const windows = services.getResource('WindowsService');
        const scene = scenes.createScene('First click drag regression', { makeActive: true });
        const horizontal = scene.createAndAddSource('Single drag item', 'color_source', {
          width: 80, height: 80,
        }, { select: false });
        const vertical = scene.addSource(horizontal.sourceId, { display: 'vertical', select: false });
        vertical.setTransform({ position: { x: 400, y: 300 } });
        const empty = scene.createFolder('Empty vertical folder', { display: 'vertical' });
        const event = (x, y, buttons = 1) => ({
          offsetX: x, offsetY: y, pageX: x, pageY: y, display: 'vertical',
          button: 0, buttons, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false,
        });
        const oldDimensions = {
          widths: { ...editor.renderedWidths }, heights: { ...editor.renderedHeights },
          xs: { ...editor.renderedOffsetXs }, ys: { ...editor.renderedOffsetYs },
        };
        const noops = [];
        function attempt(label, anchor) {
          const ids = [...selection.views.globalSelection.getIds()];
          const historySize = commands.undoHistory.length;
          editor.startDragging(event(440, 340), anchor);
          noops.push({ label, idle: !editor.dragHandler && !editor.state.changingPositionInProgress,
            requestsEnabled: !tcp.isRequestsHandlingStopped,
            selectionUnchanged: JSON.stringify(ids) === JSON.stringify(selection.views.globalSelection.getIds()),
            historyUnchanged: historySize === commands.undoHistory.length,
          });
        }
        try {
          selection.select([horizontal.id]);
          attempt('selected item belongs to the other canvas', horizontal);
          attempt('hovered item is not selected', vertical);
          selection.select([empty.id]);
          attempt('empty folder selection', vertical);
          selection.select([vertical.id]);
          attempt('removed or stale item', { id: 'missing-drag-source' });
          attempt('missing hovered item', undefined);
          vertical.setLocked(true);
          selection.select([vertical.id]);
          attempt('locked selected item', vertical);
          vertical.setLocked(false);
          selection.select([]);

          const factor = process.platform === 'win32' ? windows.state.main.scaleFactor : 1;
          const resolution = video.baseResolutions.vertical;
          editor.handleOutputResize({ x: 0, y: 0,
            width: resolution.baseWidth * factor, height: resolution.baseHeight * factor,
          }, 'vertical');
          const before = { ...vertical.transform.position };
          editor.handleMouseDown(event(440, 340));
          editor.handleMouseMove(event(440, 340));
          const started = !!editor.dragHandler && editor.state.changingPositionInProgress;
          const selected = selection.views.globalSelection.getIds();
          editor.handleMouseMove({ ...event(455, 365), ctrlKey: true });
          editor.handleMouseUp(event(455, 365, 0));
          const moved = { ...vertical.transform.position };
          commands.undo();
          return { noops, started, selected, verticalId: vertical.id, before, moved,
            undone: { ...vertical.transform.position },
            stopped: !editor.dragHandler && !editor.state.changingPositionInProgress && !tcp.isRequestsHandlingStopped,
          };
        } finally {
          vertical.setLocked(false);
          if (editor.dragHandler || editor.resizeRegion) editor.handleMouseUp(event(455, 365, 0));
          Object.assign(editor.renderedWidths, oldDimensions.widths);
          Object.assign(editor.renderedHeights, oldDimensions.heights);
          Object.assign(editor.renderedOffsetXs, oldDimensions.xs);
          Object.assign(editor.renderedOffsetYs, oldDimensions.ys);
        }
      })();
    `);

    result.noops.forEach(attempt => {
      t.true(attempt.idle, `${attempt.label}: editor remains idle`);
      t.true(attempt.requestsEnabled, `${attempt.label}: API requests remain enabled`);
      t.true(attempt.selectionUnchanged, `${attempt.label}: selection is unchanged`);
      t.true(attempt.historyUnchanged, `${attempt.label}: history is unchanged`);
    });
    t.true(result.started, 'the first mouse move selects the item before starting its drag');
    t.deepEqual(result.selected, [result.verticalId]);
    t.true(Math.abs(result.moved.x - result.before.x - 15) < 0.01);
    t.true(Math.abs(result.moved.y - result.before.y - 25) < 0.01);
    t.deepEqual(result.undone, result.before);
    t.true(result.stopped);
  } finally {
    await focusMain();
  }
});
