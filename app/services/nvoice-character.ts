import electron from 'electron';
import path, { dirname } from 'path';
import { $t } from 'services/i18n';
import Vue from 'vue';
import { InitAfter, Inject, mutation, StatefulService } from './core';
import { ISceneNodeAddOptions } from './scenes';
import { ISourceApi, SourcesService } from './sources';
import { NVoiceCharacterManager } from './sources/properties-managers/nvoice-character-manager';
import { VideoService } from './video';
import * as remote from '@electron/remote';

// NVoiceのキャラクターの種類を定義
export const NVoiceCharacterTypes = ['near'] as const;
export type NVoiceCharacterType = (typeof NVoiceCharacterTypes)[number];

export interface ICharacterSource {
  sourceId: string;
  type: NVoiceCharacterType;
}

export interface INVoiceCharacterSourceState {
  characterSources: Dictionary<ICharacterSource>;
  port: number;
}

@InitAfter('SourcesService')
export class NVoiceCharacterService extends StatefulService<INVoiceCharacterSourceState> {
  static initialState: INVoiceCharacterSourceState = {
    characterSources: {},
    port: 0,
  };

  @Inject() sourcesService: SourcesService;
  @Inject() videoService: VideoService;

  init() {
    this.sourcesService.sourceAdded.subscribe(sourceModel => {
      if (sourceModel.propertiesManagerType === 'nvoice-character') {
        const source = this.sourcesService.getSource(sourceModel.sourceId);

        this.ADD_CHARACTER_SOURCE({
          sourceId: sourceModel.sourceId,
          type: source.getPropertiesManagerSettings().nVoiceCharacterType,
        });
      }
    });
    this.sourcesService.sourceUpdated.subscribe(sourceModel => {
      if (sourceModel.propertiesManagerType === 'nvoice-character') {
        if (sourceModel.propertiesManagerType === 'nvoice-character') {
          if (!this.state.characterSources[sourceModel.sourceId]) {
            const source = this.sourcesService.getSource(sourceModel.sourceId);
            this.ADD_CHARACTER_SOURCE({
              sourceId: sourceModel.sourceId,
              type: source.getPropertiesManagerSettings().nVoiceCharacterType,
            });
          }
        } else {
          if (this.state.characterSources[sourceModel.sourceId]) {
            this.REMOVE_CHARACTER_SOURCE(sourceModel.sourceId);
          }
        }
      }
    });
    this.sourcesService.sourceRemoved.subscribe(sourceModel => {
      if (sourceModel.propertiesManagerType === 'nvoice-character') {
        this.REMOVE_CHARACTER_SOURCE(sourceModel.sourceId);
      }
    });
  }

  updateSocketIoPort(port: number) {
    console.log('updateSocketIoPort', port);
    if (this.state.port === port) return;
    this.SET_PORT(port);
    for (const sourceId of Object.keys(this.state.characterSources)) {
      const source = this.sourcesService.getSource(sourceId);
      const type = source.getPropertiesManagerSettings().nVoiceCharacterType;
      const url = this.getUrl(type, port);
      // URLを更新する
      (
        this.sourcesService.propertiesManagers[sourceId].manager as NVoiceCharacterManager
      ).setNVoiceCharacterType(type);
    }
  }

  getUrl(type: NVoiceCharacterType, port?: number): string {
    const appPath = remote.app.isPackaged
      ? dirname(remote.app.getPath('exe'))
      : remote.app.getAppPath();
    const url =
      'file://' + path.join(appPath, 'nvoice', type, `index.html?port=${port || this.state.port}`);
    return url;
  }

  createNVoiceCharacterSource(
    type: NVoiceCharacterType,
    name?: string,
  ): { source: ISourceApi; options: ISceneNodeAddOptions } {
    const suggestedName =
      name || this.sourcesService.suggestName($t(`source-props.nvoice_character.${type}.name`));
    const width = 1000 / 4;
    const height = 1800 / 4;
    return {
      source: this.sourcesService.createSource(
        suggestedName,
        'browser_source',
        {
          url: this.getUrl(type, this.state.port),
          width,
          height,
        },
        {
          propertiesManager: 'nvoice-character',
          propertiesManagerSettings: {
            nVoiceCharacterType: type,
          },
        },
      ),
      options: {
        initialTransform: {
          position: {
            // 右下に配置
            x: this.videoService.baseWidth - width,
            y: this.videoService.baseHeight - height,
          },
        },
      },
    };
  }

  @mutation()
  private SET_PORT(port: number) {
    this.state.port = port;
  }

  @mutation()
  private ADD_CHARACTER_SOURCE(widgetSource: ICharacterSource) {
    Vue.set(this.state.characterSources, widgetSource.sourceId, widgetSource);
  }

  @mutation()
  private REMOVE_CHARACTER_SOURCE(sourceId: string) {
    Vue.delete(this.state.characterSources, sourceId);
  }
}
