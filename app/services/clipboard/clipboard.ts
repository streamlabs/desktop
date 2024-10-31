import { execSync } from 'child_process';
import electron from 'electron';
import { mutation, StatefulService } from 'services/core/stateful-service';
import { SceneCollectionsService } from 'services/scene-collections';
import {
  ISceneItem,
  ISceneItemFolder,
  ISceneItemSettings,
  Scene,
  SceneItem,
  SceneItemFolder,
  ScenesService,
} from 'services/scenes';
import { SelectionService } from 'services/selection';
import { shortcut } from 'services/shortcuts';
import { ISourceFilter, SourceFiltersService } from 'services/source-filters';
import { ISource, Source, SourcesService, TPropertiesManager } from 'services/sources';
import { Inject } from '../core/injector';
import { IClipboardServiceApi } from './clipboard-api';
const { clipboard } = electron;

interface ISceneNodeInfo {
  folder?: ISceneItemFolder;
  item?: ISceneItem & ISource;
  settings?: ISceneItemSettings;
}

interface ISceneInfo {
  sources: Dictionary<ISourceInfo>;
  sceneNodes: ISceneNodeInfo[];
}

interface IScenesNodes {
  current: ISceneNodeInfo[];
  [id: string]: ISceneNodeInfo[];
}

interface ISourceInfo {
  source: ISource;
  settings: Dictionary<any>;
  filters: ISourceFilter[];
  propertiesManagerType: TPropertiesManager;
  propertiesManagerSettings: Dictionary<any>;
}

interface IUnloadedCollectionClipboard {
  sources: Dictionary<ISourceInfo>;
  scenesNodes: IScenesNodes;
  filters: ISourceFilter[];
}

interface ISystemClipboard {
  text: string;
  files: string[];
}

interface IClipboardState {
  itemsSceneId: string;
  sceneNodesIds: string[];
  filterIds: string[];
  systemClipboard: ISystemClipboard;

  /**
   * stores stand-alone data for copy/paste
   * between scene collections
   */
  unloadedCollectionClipboard?: IUnloadedCollectionClipboard;
}

export class ClipboardService
  extends StatefulService<IClipboardState>
  implements IClipboardServiceApi
{
  static initialState: IClipboardState = {
    itemsSceneId: '',
    sceneNodesIds: [],
    filterIds: [],
    systemClipboard: {
      text: '',
      files: [],
    },
    unloadedCollectionClipboard: {
      sources: {},
      scenesNodes: {
        current: [],
      },
      filters: [],
    },
  };

  @Inject() private scenesService: ScenesService;
  @Inject() private sourcesService: SourcesService;
  @Inject() private sourceFiltersService: SourceFiltersService;
  @Inject() private selectionService: SelectionService;
  @Inject() private sceneCollectionsService: SceneCollectionsService;

  init() {
    this.sceneCollectionsService.collectionWillSwitch.subscribe(() => {
      this.beforeCollectionSwitchHandler();
    });
    this.SET_SYSTEM_CLIPBOARD(this.fetchSystemClipboard());
  }

  @shortcut('Ctrl+C')
  copy() {
    this.SET_SCENE_ITEMS_IDS(this.selectionService.getIds());
    this.SET_SCENE_ITEMS_SCENE(this.scenesService.activeScene.id);
  }

  @shortcut('Ctrl+V')
  paste(duplicateSources = false) {
    const systemClipboard = this.fetchSystemClipboard();
    if (JSON.stringify(this.state.systemClipboard) !== JSON.stringify(systemClipboard)) {
      this.clear();
      this.SET_SYSTEM_CLIPBOARD(systemClipboard);
    }

    if (this.hasItems()) {
      if (this.hasItemsInUnloadedClipboard()) {
        this.pasteItemsFromUnloadedClipboard();
        return;
      }
      const insertedItems = this.scenesService
        .getScene(this.state.itemsSceneId)
        .getSelection(this.state.sceneNodesIds)
        .copyTo(this.scenesService.activeSceneId, null, duplicateSources);
      if (insertedItems.length) this.selectionService.select(insertedItems);
    } else if (this.hasSystemClipboard()) {
      this.pasteFromSystemClipboard();
    }
  }

  copyFilters() {
    const source = this.selectionService.getLastSelected();
    if (!source) return;
    this.SET_FILTERS_IDS([source.sourceId]);
    this.SET_UNLOADED_CLIPBOARD_FILTERS([]);
  }

  pasteFilters() {
    const source = this.selectionService.getItems()[0];
    if (!source) return;

    if (this.hasFiltersInUnloadedClipboard()) {
      this.pasteFiltersFromUnloadedClipboard();
      return;
    }
    this.state.filterIds.forEach(fromSourceId => {
      const fromSource = this.sourcesService.getSource(fromSourceId);
      if (!fromSource) return;
      this.sourceFiltersService.copyFilters(fromSource.sourceId, source.sourceId);
    });
  }

  hasData(): boolean {
    return this.hasItems() || this.hasSystemClipboard();
  }

  hasItems(): boolean {
    return !!(this.state.sceneNodesIds.length || this.hasItemsInUnloadedClipboard());
  }

  hasFilters() {
    return !!(this.state.filterIds.length || this.hasFiltersInUnloadedClipboard());
  }

  hasSystemClipboard() {
    return !!(this.state.systemClipboard.text || this.state.systemClipboard.files.length);
  }

  clear() {
    this.SET_FILTERS_IDS([]);
    this.SET_SCENE_ITEMS_IDS([]);
    this.SET_SCENE_ITEMS_SCENE('');
    this.SET_UNLOADED_CLIPBOARD_NODES({}, { current: [] });
    this.SET_UNLOADED_CLIPBOARD_FILTERS([]);
  }

  private fetchSystemClipboard(): ISystemClipboard {
    let files: string[] = [];
    const text = clipboard.readText() || '';
    if (!text) files = this.getFiles();
    return { text, files };
  }

  private pasteItemsFromUnloadedClipboard() {
    const sourceIdMap: Dictionary<string> = {};
    const sources = this.state.unloadedCollectionClipboard.sources;
    const scene = this.scenesService.activeScene;

    // create sources
    Object.keys(sources).forEach(sourceId => {
      const sourceInfo = sources[sourceId];
      const sourceModel = sourceInfo.source;
      let createdSource: Source;

      if (sourceModel.type === 'scene') {
        const scene = this.scenesService.createScene(sourceModel.name);
        createdSource = scene.getSource();
        sourceIdMap[sourceModel.sourceId] = createdSource.sourceId;
        this.pasteSceneNodes(
          sourceModel.sourceId,
          this.state.unloadedCollectionClipboard.scenesNodes,
          sourceIdMap,
        );
      } else {
        createdSource = this.sourcesService.createSource(
          sourceModel.name,
          sourceModel.type,
          sourceInfo.settings,
          {
            propertiesManager: sourceInfo.propertiesManagerType,
            propertiesManagerSettings: sourceInfo.propertiesManagerSettings,
          },
        );
        sourceIdMap[sourceModel.sourceId] = createdSource.sourceId;
      }

      // add filters
      sourceInfo.filters.forEach(filter => {
        this.sourceFiltersService.add(
          createdSource.sourceId,
          filter.type,
          filter.name,
          filter.settings,
        );
      });
    });

    const insertedNodesIds = this.pasteSceneNodes(
      'current',
      this.state.unloadedCollectionClipboard.scenesNodes,
      sourceIdMap,
    );

    // now we can convert unloadedCollectionClipboard to regular clipboard
    // to avoid duplication of sources
    this.SET_SCENE_ITEMS_IDS(insertedNodesIds);
    this.SET_SCENE_ITEMS_SCENE(scene.id);
    this.SET_UNLOADED_CLIPBOARD_NODES({}, { current: [] });
  }

  private pasteSceneNodes(
    sceneId: string | 'current',
    scenesNodes: Dictionary<ISceneNodeInfo[]>,
    sourceIdMap: Dictionary<string>,
  ): string[] {
    const scene =
      sceneId === 'current'
        ? this.scenesService.activeScene
        : this.scenesService.getScene(sourceIdMap[sceneId]);

    const insertedNodesIds: string[] = [];
    const folderIdMap: Dictionary<string> = {};
    const nodes = scenesNodes[sceneId].concat([]).reverse();

    // create folders
    nodes
      .filter(node => node.folder)
      .forEach(node => {
        const folderModel = node.folder as ISceneItemFolder;
        const folder = scene.createFolder(folderModel.name);
        folderIdMap[folderModel.id] = folder.id;
        insertedNodesIds.push(folder.id);
      });

    // create sceneItems and set parent nodes for folders and items
    nodes.forEach(node => {
      // set parent for folders
      if (node.folder) {
        const folderModel = node.folder as ISceneItemFolder;
        if (folderModel.parentId) {
          scene.getFolder(folderIdMap[folderModel.id]).setParent(folderIdMap[folderModel.parentId]);
        }
        return;
      }

      const itemModel = node.item as ISceneItem & ISource;

      // add sceneItem and apply settings
      const sceneItem = scene.addSource(sourceIdMap[itemModel.sourceId]);
      sceneItem.setSettings(node.settings);

      // set parent for item
      if (itemModel.parentId) sceneItem.setParent(folderIdMap[itemModel.parentId]);

      insertedNodesIds.push(sceneItem.id);
    });

    return insertedNodesIds;
  }

  private pasteFromSystemClipboard() {
    const clipboard = this.state.systemClipboard;
    const scene = this.scenesService.activeScene;
    if (clipboard.files.length) {
      clipboard.files.forEach(filePath => scene.addFile(filePath));
      return;
    }
    const urlRegex =
      /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/;
    const text = clipboard.text;

    if (text.match(urlRegex)) {
      scene.createAndAddSource(text, 'browser_source', {
        url: text,
        is_local_file: false,
      });
    } else {
      scene.createAndAddSource(text, 'text_gdiplus', { text });
    }
  }

  private pasteFiltersFromUnloadedClipboard() {
    const source = this.selectionService.getItems()[0];
    this.state.unloadedCollectionClipboard.filters.forEach(filter => {
      this.sourceFiltersService.add(source.sourceId, filter.type, filter.name, filter.settings);
    });
  }

  private beforeCollectionSwitchHandler() {
    // save nodes to unloaded clipboard
    if (!this.hasItemsInUnloadedClipboard() && this.hasItems()) {
      let sourcesInfo: Dictionary<ISourceInfo> = {};
      const scenes = this.scenesService.activeScene.getNestedScenes();
      const scenesNodes: IScenesNodes = { current: [] };

      scenes.forEach(scene => {
        const sceneInfo = this.getSceneInfo(scene, sourcesInfo);
        scenesNodes[scene.id] = sceneInfo.sceneNodes;
        sourcesInfo = sceneInfo.sources;
      });

      const sceneInfo = this.getSceneInfo(
        this.scenesService.getScene(this.state.itemsSceneId),
        sourcesInfo,
        this.state.sceneNodesIds,
      );

      scenesNodes.current = sceneInfo.sceneNodes;
      sourcesInfo = sceneInfo.sources;

      this.SET_UNLOADED_CLIPBOARD_NODES(sourcesInfo, scenesNodes);
    }

    if (!this.hasFiltersInUnloadedClipboard() && this.hasFilters()) {
      this.SET_UNLOADED_CLIPBOARD_FILTERS(
        this.sourceFiltersService.getFilters(this.state.filterIds[0]),
      );
    }

    this.SET_FILTERS_IDS([]);
    this.SET_SCENE_ITEMS_IDS([]);
    this.SET_SCENE_ITEMS_SCENE('');
  }

  private getSceneInfo(
    scene: Scene,
    sourcesInfo: Dictionary<ISourceInfo>,
    nodesIds: string[] = [],
  ): ISceneInfo {
    const selection = nodesIds.length
      ? scene.getSelection(nodesIds)
      : scene.getSelection().selectAll();

    const nodes = selection.getNodes();

    const nodesInfo: ISceneNodeInfo[] = nodes.map(node => {
      if (node.isFolder()) {
        return { folder: (node as SceneItemFolder).getModel() };
      }

      const item = node as SceneItem;

      if (!sourcesInfo[item.sourceId]) {
        const source = item.getSource();
        sourcesInfo[item.sourceId] = {
          source: item.getModel(),
          settings: source.getSettings(),
          propertiesManagerType: source.getPropertiesManagerType(),
          propertiesManagerSettings: source.getPropertiesManagerSettings(),
          filters: this.sourceFiltersService.getFilters(source.sourceId),
        };
      }

      return {
        item: (node as SceneItem).getModel(),
        settings: item.getSettings(),
      };
    });

    return {
      sources: sourcesInfo,
      sceneNodes: nodesInfo,
    };
  }

  private hasItemsInUnloadedClipboard(): boolean {
    const clipboard = this.state.unloadedCollectionClipboard;
    return !!(
      clipboard &&
      clipboard.scenesNodes &&
      clipboard.scenesNodes.current &&
      clipboard.scenesNodes.current.length
    );
  }

  private hasFiltersInUnloadedClipboard(): boolean {
    return !!(
      this.state.unloadedCollectionClipboard &&
      this.state.unloadedCollectionClipboard.filters &&
      this.state.unloadedCollectionClipboard.filters.length
    );
  }

  private getFiles() {
    // electron clipboard doesn't support file system
    // use .NET API instead
    return execSync(
      'Powershell -command Add-Type -AssemblyName System.Windows.Forms;' +
        '[System.Windows.Forms.Clipboard]::GetFileDropList()',
    )
      .toString()
      .split('\n')
      .filter(fineName => fineName)
      .map(fileName => fileName.trim());
  }

  @mutation()
  private SET_SYSTEM_CLIPBOARD(systemClipboard: ISystemClipboard) {
    this.state.systemClipboard = systemClipboard;
  }

  @mutation()
  private SET_SCENE_ITEMS_IDS(ids: string[]) {
    this.state.sceneNodesIds = ids;
  }

  @mutation()
  private SET_FILTERS_IDS(filtersIds: string[]) {
    this.state.filterIds = filtersIds;
  }

  @mutation()
  private SET_SCENE_ITEMS_SCENE(sceneId: string) {
    this.state.itemsSceneId = sceneId;
  }

  @mutation()
  private SET_UNLOADED_CLIPBOARD_NODES(
    sources: Dictionary<ISourceInfo>,
    scenesNodes: IScenesNodes,
  ) {
    this.state.unloadedCollectionClipboard.sources = sources;
    this.state.unloadedCollectionClipboard.scenesNodes = scenesNodes;
  }

  @mutation()
  private SET_UNLOADED_CLIPBOARD_FILTERS(filters: ISourceFilter[]) {
    this.state.unloadedCollectionClipboard.filters = filters;
  }
}
