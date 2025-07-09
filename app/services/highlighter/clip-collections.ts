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
  collectionOrderPosition: number;
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

        console.log(`clipDict ${clip.enabled} from collection ${collectionClip.enabled}`);

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

  exportClipCollection(collectionId: string) {
    // Get clips from the collection
    const clips = this.getClipsFromCollection(collectionId);
    if (clips.length === 0) {
      console.warn(`No clips found in collection ${collectionId} to export`);
      return;
    }

    // Export the clips using the highlighter service
    console.log('start export');

    this.highlighterService.actions.export(false, clips);
  }
}
