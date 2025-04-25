import { UserService } from 'app-services';
import fs from 'fs';
import mime from 'mime';
import { platformRequest } from '../utils';
import { Inject } from 'services/core';

export interface ITikTokVideoUploadOptions {
  title: string;
  description: string;
  tags?: string[];
}

export interface ITikTokUploadResponse {
  video_id: string;
  share_url: string;
}

interface IUploadProgress {
  uploadedBytes: number;
  totalBytes: number;
}

export class TikTokUploader {
  @Inject() userService: UserService;

  get oauthToken() {
    return this.userService.state.auth?.platforms?.tiktok?.token;
  }

  uploadVideo(
    filePath: string,
    options: ITikTokVideoUploadOptions,
    onProgress: (progress: IUploadProgress) => void,
  ): { cancel: () => void; complete: Promise<ITikTokUploadResponse> } {
    let cancelRequested = false;
    const oauthToken = this.oauthToken;

    async function doUpload(): Promise<ITikTokUploadResponse> {
      const stats = fs.lstatSync(filePath);
      const type = mime.getType(filePath) ?? 'application/octet-stream';

      onProgress({
        totalBytes: stats.size,
        uploadedBytes: 0,
      });

      // Step 1: Get upload URL
      const uploadUrlResponse = await platformRequest(
        'tiktok',
        {
          url: 'https://open-api.tiktok.com/share/video/upload/',
          method: 'POST',
          headers: {
            Authorization: `Bearer ${oauthToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: options.title,
            description: options.description,
            tags: options.tags,
          }),
        },
        true,
        false,
      );

      const { upload_url: uploadUrl } = await uploadUrlResponse.json();
      if (!uploadUrl) {
        throw new Error('Failed to retrieve TikTok upload URL.');
      }

      // Step 2: Upload video file
      const fileStream = fs.createReadStream(filePath);
      const result = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Type': type,
          'Content-Length': stats.size.toString(),
        },
        body: fileStream,
      });

      if (!result.ok) {
        throw new Error(`Video upload failed with status ${result.status}`);
      }

      const responseJson = await result.json();
      onProgress({
        totalBytes: stats.size,
        uploadedBytes: stats.size,
      });

      // Step 3: Return response
      return {
        video_id: responseJson.data.video_id,
        share_url: responseJson.data.share_url,
      };
    }

    return {
      cancel: () => (cancelRequested = true),
      complete: doUpload(),
    };
  }
}
