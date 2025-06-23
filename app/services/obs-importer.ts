import * as remote from '@electron/remote';
import fs from 'fs';
import defaultTo from 'lodash/defaultTo';
import path from 'path';
import { AudioService } from 'services/audio';
import { Inject } from 'services/core/injector';
import { Service } from 'services/core/service';
import { SceneCollectionsService } from 'services/scene-collections';
import { ScenesService } from 'services/scenes';
import { SettingsService } from 'services/settings';
import { SourceFiltersService, TSourceFilterType } from 'services/source-filters';
import { SourcesService } from 'services/sources';
import { TPropertiesManager, TSourceType } from 'services/sources/sources-api';
import { ETransitionType, TransitionsService } from 'services/transitions';
import * as obs from '../../obs-api';

interface Source {
  name?: string;
  sourceId?: string;
}

interface ISceneCollection {
  filename: string;
  name: string;
}

interface IOBSConfigFilter {
  id: TSourceFilterType;
  name: string;
  enabled: boolean;
  settings: Dictionary<any>;
}

interface IOBSConfigSceneItem {
  name: string;
  source_uuid: string;
  id: string;
  rot: number;
  crop_top: number;
  crop_right: number;
  crop_bottom: number;
  crop_left: number;
  pos: IVec2;
  scale: IVec2;
  visible: boolean;
  locked: boolean;
  bounds: IVec2;
  bounds_align: number;
  bounds_type: number;
  blend_type: 'normal' | 'additive' | 'subtract' | 'screen' | 'multiply' | 'lighten' | 'darken';
  blend_method: 'default' | 'srgb_off';
  scale_filter: 'disable' | 'point' | 'bilinear' | 'bicubic' | 'lanczos' | 'area';
}

interface IOBSConfigSource {
  id: TSourceType;
  name: string;
  settings: {
    shutdown?: boolean;
    items?: IOBSConfigSceneItem[];
    url?: string;
  };
  channel?: number;
  muted: boolean;
  volume: number;
  filters: IOBSConfigFilter[];
  mixers: number;
  monitoring_type: number;
  sync: number;
  flags: number;
}

interface IOBSConfigTransition {
  id: string;
}

interface IOBSAudioSourceConfigJSON {
  id: TSourceType;
  muted: boolean;
  volume: number;
}

interface IOBSConfigJSON {
  sources: IOBSConfigSource[];
  current_scene: string;
  scene_order: { name: string }[];
  transitions: IOBSConfigTransition[];
  transition_duration: number;

  DesktopAudioDevice1?: IOBSAudioSourceConfigJSON;
  DesktopAudioDevice2?: IOBSAudioSourceConfigJSON;
  AuxAudioDevice1?: IOBSAudioSourceConfigJSON;
  AuxAudioDevice2?: IOBSAudioSourceConfigJSON;
  AuxAudioDevice3?: IOBSAudioSourceConfigJSON;
}

export class ObsImporterService extends Service {
  @Inject() scenesService: ScenesService;
  @Inject() sourcesService: SourcesService;
  @Inject('SourceFiltersService') filtersService: SourceFiltersService;
  @Inject() transitionsService: TransitionsService;
  @Inject() sceneCollectionsService: SceneCollectionsService;
  @Inject() audioService: AudioService;
  @Inject() settingsService: SettingsService;

  async load(selectedprofile: string) {
    if (!this.isOBSinstalled()) return;

    // Scene collections
    const collections = this.getSceneCollections();
    for (const collection of collections) {
      await this.importCollection(collection);
    }

    // Profile
    this.importProfile(selectedprofile);

    // Select current scene collection
    const globalConfigFile = path.join(this.OBSconfigFileDirectory, 'global.ini');

    const data = fs.readFileSync(globalConfigFile).toString();

    if (data) {
      const match = data.match(/^SceneCollection\=(.*)$/m);
      if (match && match[1]) {
        const coll = this.sceneCollectionsService.collections.find(co => co.name === match[1]);
        if (coll) this.sceneCollectionsService.load(coll.id);
      }
    }

    obs.NodeObs.OBS_service_resetVideoContext();
    obs.NodeObs.OBS_service_resetAudioContext();

    // Ensure we reload any updated settings
    this.settingsService.loadSettingsIntoStore();
  }

  private async importCollection(collection: ISceneCollection) {
    const sceneCollectionPath = path.join(this.sceneCollectionsDirectory, collection.filename);
    const configJSON: IOBSConfigJSON = JSON.parse(fs.readFileSync(sceneCollectionPath).toString());

    await this.sceneCollectionsService.create({
      name: collection.name,
      setupFunction: () => {
        this.importSources(configJSON);
        this.importScenes(configJSON);
        this.importSceneOrder(configJSON);
        this.importMixerSources(configJSON);
        this.importTransitions(configJSON);

        if (this.scenesService.scenes.length === 0) {
          return false;
        }

        return true;
      },
    });
  }

  importFilters(filtersJSON: IOBSConfigFilter[], source: Source) {
    if (Array.isArray(filtersJSON)) {
      filtersJSON.forEach(filterJSON => {
        const isFilterAvailable = this.filtersService.getTypes().find(availableFilter => {
          return availableFilter.type === filterJSON.id;
        });

        if (isFilterAvailable) {
          const sourceId = this.sourcesService.getSourcesByName(source.name)[0].sourceId;

          const filter = this.filtersService.add(sourceId, filterJSON.id, filterJSON.name);
          filter.enabled = filterJSON.enabled;

          // Setting properties
          const properties = this.filtersService.getPropertiesFormData(sourceId, filterJSON.name);

          if (properties) {
            if (Array.isArray(properties)) {
              properties.forEach(property => {
                if (filterJSON.settings[property.name]) {
                  property.value = filterJSON.settings[property.name];
                }
              });
            }
          }

          this.filtersService.setPropertiesFormData(sourceId, filterJSON.name, properties);
        } else {
          // TODO Report to the user that N Air does not support the filter
        }
      });
    }
  }

  importSources(configJSON: IOBSConfigJSON) {
    const sourcesJSON = configJSON.sources;

    if (Array.isArray(sourcesJSON)) {
      sourcesJSON.forEach(sourceJSON => {
        const isSourceAvailable = this.sourcesService
          .getAvailableSourcesTypes()
          .includes(sourceJSON.id);

        if (isSourceAvailable) {
          if (sourceJSON.id !== 'scene') {
            const propertiesManager: TPropertiesManager = 'default';
            if (sourceJSON.id === 'browser_source') {
              sourceJSON.settings.shutdown = true;
            }

            // Check "Shutdown source when not visible" by default for browser sources
            const source = this.sourcesService.createSource(
              sourceJSON.name,
              sourceJSON.id,
              sourceJSON.settings,
              {
                propertiesManager,
                channel: sourceJSON.channel !== 0 ? sourceJSON.channel : void 0,
              },
            );

            if (source.audio) {
              const defaultMonitoring =
                source.type === 'browser_source'
                  ? obs.EMonitoringType.MonitoringOnly
                  : obs.EMonitoringType.None;

              this.audioService.getSource(source.sourceId).setMuted(sourceJSON.muted);
              this.audioService.getSource(source.sourceId).setMul(sourceJSON.volume);
              this.audioService.getSource(source.sourceId).setSettings({
                audioMixers: defaultTo(sourceJSON.mixers, 255),
                monitoringType: defaultTo(sourceJSON.monitoring_type, defaultMonitoring),
                syncOffset: defaultTo(sourceJSON.sync / 1000000, 0),
                forceMono: !!(sourceJSON.flags & obs.ESourceFlags.ForceMono),
              });
            }

            // Adding the filters
            const filtersJSON = sourceJSON.filters;
            this.importFilters(filtersJSON, source);
          }
        } else {
          // TODO Report to the user that N Air does not support the source
        }
      });
    }
  }

  importScenes(configJSON: IOBSConfigJSON) {
    const sourcesJSON = configJSON.sources;
    const currentScene = configJSON.current_scene;

    // OBS uses unique scene names instead id
    // so create a mapping variable
    const nameToIdMap: Dictionary<string> = {};

    if (Array.isArray(sourcesJSON)) {
      // Create all the scenes
      sourcesJSON.forEach(sourceJSON => {
        if (sourceJSON.id === 'scene') {
          const scene = this.scenesService.createScene(sourceJSON.name, {
            makeActive: sourceJSON.name === currentScene,
          });
          nameToIdMap[scene.name] = scene.id;
        }
      });

      // Add all the sceneItems to every scene
      sourcesJSON.forEach(sourceJSON => {
        if (sourceJSON.id === 'scene') {
          const scene = this.scenesService.getScene(nameToIdMap[sourceJSON.name]);
          if (!scene) return;

          const sceneItems = sourceJSON.settings.items;
          if (Array.isArray(sceneItems)) {
            // Looking for the source to add to the scene
            sceneItems.forEach(item => {
              const sourceToAdd = this.sourcesService.getSources().find(source => {
                return source.name === item.name;
              });
              if (sourceToAdd) {
                const sceneItem = scene.addSource(sourceToAdd.sourceId);

                const crop = {
                  bottom: item.crop_bottom,
                  left: item.crop_left,
                  right: item.crop_right,
                  top: item.crop_top,
                };
                const pos = item.pos;
                const scale = item.scale;
                const rot = item.rot;

                if (
                  item.bounds &&
                  item.bounds.x &&
                  item.bounds.y &&
                  item.bounds_align === 0 &&
                  [1, 2].includes(item.bounds_type)
                ) {
                  scene.fixupSceneItemWhenReady(sourceToAdd.sourceId, () => {
                    switch (item.bounds_type) {
                      case 1: // stretch
                        sceneItem.stretchToScreen();
                        break;
                      case 2: // fit
                        sceneItem.fitToScreen();
                        break;
                    }
                  });
                }

                let blendingMode: obs.EBlendingMode;
                switch (item.blend_type) {
                  case 'normal': {
                    blendingMode = obs.EBlendingMode.Normal;
                    break;
                  }
                  case 'additive': {
                    blendingMode = obs.EBlendingMode.Additive;
                    break;
                  }
                  case 'subtract': {
                    blendingMode = obs.EBlendingMode.Substract;
                    break;
                  }
                  case 'screen': {
                    blendingMode = obs.EBlendingMode.Screen;
                    break;
                  }
                  case 'multiply': {
                    blendingMode = obs.EBlendingMode.Multiply;
                    break;
                  }
                  case 'lighten': {
                    blendingMode = obs.EBlendingMode.Lighten;
                    break;
                  }
                  case 'darken': {
                    blendingMode = obs.EBlendingMode.Darken;
                    break;
                  }
                  default: {
                    blendingMode = obs.EBlendingMode.Normal;
                    break;
                  }
                }

                let blendingMethod: obs.EBlendingMethod;
                switch (item.blend_method) {
                  case 'default': {
                    blendingMethod = obs.EBlendingMethod.Default;
                    break;
                  }
                  case 'srgb_off': {
                    blendingMethod = obs.EBlendingMethod.SrgbOff;
                    break;
                  }
                  default: {
                    blendingMethod = obs.EBlendingMethod.Default;
                    break;
                  }
                }

                let scaleFilter: obs.EScaleType;
                switch (item.scale_filter) {
                  case 'disable': {
                    scaleFilter = obs.EScaleType.Disable;
                    break;
                  }
                  case 'point': {
                    scaleFilter = obs.EScaleType.Point;
                    break;
                  }
                  case 'bilinear': {
                    scaleFilter = obs.EScaleType.Bilinear;
                    break;
                  }
                  case 'bicubic': {
                    scaleFilter = obs.EScaleType.Bicubic;
                    break;
                  }
                  case 'lanczos': {
                    scaleFilter = obs.EScaleType.Lanczos;
                    break;
                  }
                  case 'area': {
                    scaleFilter = obs.EScaleType.Area;
                    break;
                  }
                  default: {
                    scaleFilter = obs.EScaleType.Disable;
                    break;
                  }
                }

                sceneItem.setSettings({
                  visible: item.visible,
                  locked: item.locked,
                  transform: {
                    crop,
                    scale,
                    position: pos,
                    rotation: rot,
                  },
                  blendingMode,
                  blendingMethod,
                  scaleFilter,
                });
              }
            });
          }
        }
      });
    }
  }

  importSceneOrder(configJSON: IOBSConfigJSON) {
    const sceneNames: string[] = [];
    const sceneOrderJSON = configJSON.scene_order;
    const listScene = this.scenesService.scenes;

    if (Array.isArray(sceneOrderJSON)) {
      sceneOrderJSON.forEach(obsScene => {
        sceneNames.push(
          listScene.find(scene => {
            return scene.name === obsScene.name;
          }).id,
        );
      });
    }
    this.scenesService.setSceneOrder(sceneNames);
  }

  importMixerSources(configJSON: IOBSConfigJSON) {
    const channelNames = [
      'DesktopAudioDevice1',
      'DesktopAudioDevice2',
      'AuxAudioDevice1',
      'AuxAudioDevice2',
      'AuxAudioDevice3',
    ] as const;
    channelNames.forEach((channelName, i) => {
      const audioSource = configJSON[channelName];
      if (audioSource) {
        const newSource = this.sourcesService.createSource(
          channelName,
          audioSource.id,
          {},
          { channel: i + 1 },
        );

        this.audioService.getSource(newSource.sourceId).setMuted(audioSource.muted);
        this.audioService.getSource(newSource.sourceId).setMul(audioSource.volume);
      }
    });
  }

  // TODO: Fix this function
  importTransitions(configJSON: IOBSConfigJSON) {
    // Only import a single transition from OBS for now.
    // Eventually we should import all transitions
    if (configJSON.transitions && configJSON.transitions.length > 0) {
      this.transitionsService.deleteAllTransitions();
      this.transitionsService.createTransition(
        configJSON.transitions[0].id as ETransitionType,
        'Global Transition',
        { duration: configJSON.transition_duration },
      );
    }
  }

  importProfile(profile: string) {
    const profileDirectory = path.join(this.profilesDirectory, profile);
    const files = fs.readdirSync(profileDirectory);

    files.forEach(file => {
      if (file === 'basic.ini' || file === 'streamEncoder.json' || file === 'recordEncoder.json') {
        const obsFilePath = path.join(profileDirectory, file);

        const appData = remote.app.getPath('userData');
        const currentFilePath = path.join(appData, file);

        const readData = fs.readFileSync(obsFilePath);
        fs.writeFileSync(currentFilePath, readData);
      }
    });
  }

  getSceneCollections(): ISceneCollection[] {
    if (!this.isOBSinstalled()) return [];
    if (!fs.existsSync(this.sceneCollectionsDirectory)) return [];

    let files = fs.readdirSync(this.sceneCollectionsDirectory);

    files = files.filter(file => !file.match(/\.bak$/));
    return files.map(file => {
      return {
        filename: file,
        name: file.replace('_', ' ').replace('.json', ''),
      };
    });
  }

  getProfiles(): string[] {
    if (!this.isOBSinstalled()) return [];

    let profiles = fs.readdirSync(this.profilesDirectory);
    profiles = profiles.filter(profile => !profile.match(/\./));
    return profiles;
  }

  get OBSconfigFileDirectory() {
    return path.join(remote.app.getPath('appData'), 'obs-studio');
  }

  get sceneCollectionsDirectory() {
    return path.join(this.OBSconfigFileDirectory, 'basic/scenes/');
  }

  get profilesDirectory() {
    return path.join(this.OBSconfigFileDirectory, 'basic/profiles');
  }

  isOBSinstalled() {
    return fs.existsSync(this.OBSconfigFileDirectory);
  }

  get canImportFromOBS(): boolean {
    if (!this.getSceneCollections().length) return false;
    if (!this.getProfiles().length) return false;
    return true;
  }
}
