import { HighlighterService } from 'app-services';
import { InitAfter, Inject, Service } from 'services/core';
import { IUploadInfo, TClip } from './models/highlighter.models';
import uuid from 'uuid';
import { IExportInfo } from './models/rendering.models';

interface IVideoInfo {
  aspectRatio: string;
  description: string;
  title: string;
  thumbnailUrl: string;
}

export interface IClipCollection {
  id: string;
  streamId: string;
  clipCollectionInfo?: IVideoInfo;
  exportedFilePath?: string;
  clips?: Dictionary<TClip>;
  // export: IExportInfo;
  // uploads: IUploadInfo[];
  // Video settings
  // ...any other per-collection options
}
export class ClipCollectionManager {
  highlighterService: HighlighterService;

  constructor(highlighterService: HighlighterService) {
    this.highlighterService = highlighterService;
  }

  addClipCollection(streamId?: string) {
    console.log('Creating new clip collection for stream:', streamId);
  }

  createClipCollection() {
    const id = uuid.v4();
    const clipCollectionInfo: IClipCollection = {
      id,
      streamId: 'dummy-stream-id',
    };
    // based on logic from the highlighter service
    this.highlighterService.ADD_CLIPS_COLLECTION(clipCollectionInfo);
    console.log('Adding clip to collection');
  }
}
