import { HighlighterService } from 'app-services';
import { InitAfter, Inject, Service } from 'services/core';
import { IUploadInfo, TClip } from './models/highlighter.models';
import uuid from 'uuid';
import { IExportInfo } from './models/rendering.models';
import { Dictionary } from 'lodash';

interface IVideoInfo {
  aspectRatio: string;
  description: string;
  title: string;
  thumbnailUrl: string;
}

export interface IClipCollectionClip {
  clipId: string;
  enabled: boolean;
  orderPosition: number;
  startTrim?: number;
  endTrim?: number;
}

export interface IClipCollection {
  id: string;
  clipCollectionInfo?: IVideoInfo;
  exportedFilePath?: string;
  clips?: Dictionary<IClipCollectionClip>;
}
export class ClipCollectionManager {
  highlighterService: HighlighterService;

  constructor(highlighterService: HighlighterService) {
    this.highlighterService = highlighterService;
  }

  deleteCollection(collectionId: string) {
    this.highlighterService.REMOVE_CLIPS_COLLECTION(collectionId);
    console.log('Deleted collection:', collectionId);
  }

  createClipCollection(streamId: string, clipCollectionInfo?: Partial<IVideoInfo>) {
    const id = uuid.v4();
    const newClipCollection: IClipCollection = {
      id,
      clipCollectionInfo: clipCollectionInfo as IVideoInfo,
    };

    // Add the collection to the highlighter service
    this.highlighterService.ADD_CLIPS_COLLECTION(newClipCollection);

    // Add the collection ID to the stream's clipCollectionIds array
    this.highlighterService.addCollectionToStream(streamId, id);

    console.log('Added new collection:', newClipCollection);
    return newClipCollection;
  }

  addClipsToCollection(clipCollectionId: string, clips: TClip[]) {
    // Convert clips to IClipCollectionClip references with order positions
    const clipCollectionClips: Dictionary<IClipCollectionClip> = {};
    clips.forEach((clip, index) => {
      clipCollectionClips[clip.path] = {
        clipId: clip.path,
        enabled: clip.enabled,
        orderPosition: index,
        startTrim: clip.startTrim,
        endTrim: clip.endTrim,
      };
    });

    // Use the more efficient mutation that directly adds clips
    this.highlighterService.ADD_CLIPS_TO_COLLECTION(clipCollectionId, clipCollectionClips);
  }

  updateClipInCollection(clipCollectionId: string, clip: TClip) {
    // Create dictionary with the single clip to update
    const clipsToUpdate: Dictionary<Partial<IClipCollectionClip>> = {
      [clip.path]: {
        clipId: clip.path,
        startTrim: clip.startTrim,
        endTrim: clip.endTrim,
      },
    };

    // Use the more efficient mutation that directly updates clips
    this.highlighterService.UPDATE_CLIPS_IN_COLLECTION(clipCollectionId, clipsToUpdate);

    console.log(`Updated clip ${clip.path} in collection ${clipCollectionId}`);
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
          orderPosition: index,
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

  exportClipCollection(collectionId: string) {
    this.highlighterService.export();
  }
}
