import { HighlighterService } from 'app-services';
import { InitAfter, Inject, Service } from 'services/core';
import { IHighlightedStream, IUploadInfo, TClip } from './models/highlighter.models';
import uuid from 'uuid';
import { EExportStep, IExportInfo } from './models/rendering.models';
import { Dictionary } from 'lodash';
import path from 'path';
import * as remote from '@electron/remote';

interface IVideoInfo {
  aspectRatio: string;
  description: string;
  title: string;
  thumbnailUrl: string;
}

export interface IClipCollectionClip {
  clipId: string;
  enabled: boolean;
  collectionOrderPosition: number;
  startTrim?: number;
  endTrim?: number;
}

export interface ICollectionExportInfo {
  state?: 'queued' | 'exporting' | 'exported' | 'error';
  exportedFilePath?: string;
  exportInfo?: IExportInfo;
}

export interface IClipCollection {
  id: string;
  clipCollectionInfo?: IVideoInfo;
  collectionExportInfo?: ICollectionExportInfo;
  clips?: Dictionary<IClipCollectionClip>;
}
export class ClipCollectionManager {
  highlighterService: HighlighterService;
  exportQueue: Array<() => Promise<void>> = [];
  private isExporting = false;

  constructor(highlighterService: HighlighterService) {
    this.highlighterService = highlighterService;
  }

  initCollections() {
    this.resetQueuedExports();
    this.resetStuckExports();
    this.removeNonExistingCollections(
      this.highlighterService.state.highlightedStreamsDictionary,
      this.highlighterService.state.clipCollections,
    );
  }

  resetQueuedExports() {
    this.exportQueue = [];
    Object.values(this.highlighterService.views.clipCollectionsDictionary)
      .filter(collection => collection.collectionExportInfo?.state === 'queued')
      .forEach(collection => {
        this.highlighterService.UPDATE_CLIPS_COLLECTION({
          id: collection.id,
          collectionExportInfo: {
            state: undefined,
            exportInfo: undefined,
          },
        });
      });
  }

  private resetStuckExports() {
    Object.values(this.highlighterService.views.clipCollectionsDictionary)
      .filter(
        collection =>
          collection.collectionExportInfo?.state === 'exporting' ||
          collection.collectionExportInfo?.state === 'error',
      )
      .forEach(collection => {
        this.highlighterService.UPDATE_CLIPS_COLLECTION({
          id: collection.id,
          collectionExportInfo: {
            state: undefined,
            exportInfo: undefined,
          },
        });
      });
  }

  removeNonExistingCollections(
    highlightedStreamsDictionary: Dictionary<IHighlightedStream>,
    clipCollections: Dictionary<IClipCollection>,
  ) {
    Object.values(highlightedStreamsDictionary).forEach(stream => {
      if (Array.isArray(stream.clipCollectionIds)) {
        stream.clipCollectionIds.forEach(collectionId => {
          if (!clipCollections[collectionId]?.id) {
            // Delete collection and collectionIds from stream
            this.deleteCollection(collectionId);
          }
        });
      }
    });
  }

  // =================================================================================================
  // Collection handling logic
  // =================================================================================================

  createClipCollection(streamId: string, clipCollectionInfo?: Partial<IVideoInfo>) {
    const id = uuid.v4();
    const newClipCollection: IClipCollection = {
      id,
      clipCollectionInfo: clipCollectionInfo as IVideoInfo,
    };
    this.highlighterService.ADD_CLIPS_COLLECTION(newClipCollection);
    this.highlighterService.addCollectionToStream(streamId, id);
    return newClipCollection;
  }

  updateCollection(collectionUpdate: Partial<IClipCollection> & { id: string }) {
    this.highlighterService.UPDATE_CLIPS_COLLECTION(collectionUpdate);
  }

  updateCollectionExportInfo(collectionId: string, exportInfoPartial: Partial<IExportInfo>) {
    const collection = this.highlighterService.views.clipCollectionsDictionary[collectionId];
    if (!collection) {
      console.warn(`Collection ${collectionId} not found`);
      return;
    }
    console.log(`Updating export info for collection ${collectionId}`, exportInfoPartial);

    this.updateCollection({
      id: collectionId,
      collectionExportInfo: {
        ...collection.collectionExportInfo,
        exportInfo: {
          ...collection.collectionExportInfo?.exportInfo,
          ...exportInfoPartial,
        },
      },
    });
  }

  deleteCollection(collectionId: string) {
    this.highlighterService.REMOVE_CLIPS_COLLECTION(collectionId);
  }

  // =================================================================================================
  // Clips in collection logic
  // =================================================================================================

  addClipsToCollection(clipCollectionId: string, clips: TClip[]) {
    // Convert clips to IClipCollectionClip references with order positions
    const clipCollectionClips: Dictionary<IClipCollectionClip> = {};
    clips.forEach((clip, index) => {
      clipCollectionClips[clip.path] = {
        clipId: clip.path,
        enabled: clip.enabled,
        collectionOrderPosition: index,
        startTrim: clip.startTrim,
        endTrim: clip.endTrim,
      };
    });

    // Use the more efficient mutation that directly adds clips
    this.highlighterService.ADD_CLIPS_TO_COLLECTION(clipCollectionId, clipCollectionClips);
  }

  updateClipInCollection(
    clipCollectionId: string,
    clipUpdates: Partial<IClipCollectionClip> & { clipId: string },
  ) {
    // Create dictionary with the single clip to update
    const clipsToUpdate: Dictionary<Partial<IClipCollectionClip>> = {
      [clipUpdates.clipId]: {
        ...clipUpdates,
      },
    };

    // Use the more efficient mutation that directly updates clips
    this.highlighterService.UPDATE_CLIPS_IN_COLLECTION(clipCollectionId, clipsToUpdate);
  }

  removeClipsFromCollection(clipCollectionId: string, clipPaths: string[]) {
    // Get the current collection to check if it exists
    const currentCollection = this.highlighterService.views.clipCollectionsDictionary[
      clipCollectionId
    ];
    if (!currentCollection || !currentCollection.clips) {
      console.warn(`Collection ${clipCollectionId} not found or has no clips`);
      return;
    }

    // Use the more efficient mutation that directly removes clips
    this.highlighterService.REMOVE_CLIPS_FROM_COLLECTION(clipCollectionId, clipPaths);

    console.log(`Removed ${clipPaths.length} clips from collection ${clipCollectionId}`);
  }

  addClipsByIds(clipCollectionId: string, clipIds: string[]) {
    // Get existing clips from the main clips dictionary
    const clipCollectionClips: Dictionary<IClipCollectionClip> = {};
    clipIds.forEach((clipId, index) => {
      const clip = this.highlighterService.views.clipsDictionary[clipId];
      if (clip) {
        clipCollectionClips[clip.path] = {
          clipId: clip.path,
          enabled: clip.enabled,
          collectionOrderPosition: index,
          startTrim: clip.startTrim,
          endTrim: clip.endTrim,
        };
      }
    });

    // Use the more efficient mutation that directly adds clips
    this.highlighterService.ADD_CLIPS_TO_COLLECTION(clipCollectionId, clipCollectionClips);
  }

  updateClipPropertiesInCollection(
    clipCollectionId: string,
    clipPath: string,
    updates: Partial<IClipCollectionClip>,
  ) {
    // Create dictionary with the partial updates
    const clipsToUpdate: Dictionary<Partial<IClipCollectionClip>> = {
      [clipPath]: updates,
    };

    // Use the more efficient mutation that directly updates clips
    this.highlighterService.UPDATE_CLIPS_IN_COLLECTION(clipCollectionId, clipsToUpdate);

    console.log(`Updated properties for clip ${clipPath} in collection ${clipCollectionId}`);
  }

  getClipsFromCollection(collectionId: string): TClip[] {
    const collection = this.highlighterService.views.clipCollectionsDictionary[collectionId];
    if (!collection || !collection.clips) {
      console.warn(`Collection ${collectionId} not found or has no clips`);
      return [];
    }

    const clips: TClip[] = [];
    Object.keys(collection.clips).forEach(clipPath => {
      const clip = this.highlighterService.views.clipsDictionary[clipPath];
      if (clip) {
        // Create a copy of the clip with collection-specific properties applied
        const collectionClip = collection.clips![clipPath];

        clips.push({
          ...clip,
          // Override with collection-specific trim values if they exist
          startTrim: collectionClip.startTrim ?? clip.startTrim,
          endTrim: collectionClip.endTrim ?? clip.endTrim,
          enabled: collectionClip.enabled,
        });
      }
    });

    return clips;
  }

  getClipFromCollection(collectionId: string, clipPath: string): TClip {
    const globalClip = this.highlighterService.views.clipsDictionary[clipPath];
    const collection = this.highlighterService.views.clipCollectionsDictionary[collectionId];

    const collectionClip = collection.clips[clipPath];

    const returnClip = {
      ...globalClip,
      startTrim: collectionClip.startTrim ?? globalClip.startTrim,
      endTrim: collectionClip.endTrim ?? globalClip.endTrim,
      enabled: collectionClip.enabled,
    };

    return returnClip;
  }

  getClipCollectionsByStreamId(streamId: string): string[] | undefined {
    return this.highlighterService.views.highlightedStreamsDictionary[streamId].clipCollectionIds;
  }

  // =================================================================================================
  // Collection export logic
  // =================================================================================================

  async exportClipCollection(collectionId: string): Promise<void> {
    // Get clips from the collection
    const clips = this.getClipsFromCollection(collectionId);
    if (clips.length === 0) {
      console.warn(`No clips found in collection ${collectionId} to export`);
      return;
    }

    const filePath = path.join(
      remote.app.getPath('videos'),
      `O-video-${collectionId}-${Date.now()}.mp4`,
    );

    // Set initial collection export info.
    // right now gets the global export info
    this.updateCollection({
      id: collectionId,
      collectionExportInfo: {
        state: 'exporting',
        exportInfo: {
          exporting: false,
          currentFrame: 0,
          step: EExportStep.AudioMix,
          cancelRequested: false,
          error: null,
          totalFrames: 0,
          file: filePath,
          previewFile: '',
          exported: false,
          fps: this.highlighterService.views.exportInfo.fps,
          resolution: this.highlighterService.views.exportInfo.resolution,
          preset: this.highlighterService.views.exportInfo.preset,
        },
      },
    });

    await this.highlighterService.actions.return.export(false, clips, collectionId, undefined);
    if (
      this.highlighterService.views.clipCollectionsDictionary[collectionId].collectionExportInfo
        .exportInfo.error
    ) {
      this.updateCollection({
        id: collectionId,
        collectionExportInfo: {
          state: 'error',
        },
      });
      return;
    }

    if (
      this.highlighterService.views.clipCollectionsDictionary[collectionId].collectionExportInfo
        .exportInfo.exported
    ) {
      this.updateCollection({
        id: collectionId,
        collectionExportInfo: {
          state: 'exported',
          exportedFilePath: filePath,
          exportInfo: undefined,
        },
      });
    }

    console.log('Export completed for collection:', collectionId);
    return;
  }

  async processExportQueue() {
    if (this.isExporting || this.exportQueue.length === 0) return;
    this.isExporting = true;
    const nextExport = this.exportQueue.shift();
    if (nextExport) {
      try {
        await nextExport();
      } catch (e: unknown) {
        console.error('Export failed:', e);
      }
    }
    this.isExporting = false;
    if (this.exportQueue.length > 0) {
      setTimeout(() => {
        this.processExportQueue();
      }, 500);
    }
  }
}
