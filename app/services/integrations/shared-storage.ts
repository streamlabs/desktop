import { HostsService, MarkersService } from 'app-services';
import fs from 'fs';
import path from 'path';
import { Service, Inject, ViewHandler } from 'services/core';
import { UserService } from 'services/user';
import { authorizedHeaders, jfetch } from 'util/requests';
import { $t } from 'services/i18n';

interface IPrepareResponse {
  file: {
    id: string;
    status: string;
    multipart: boolean;
    mime_type: 'video/mpeg';
    original_filename: string;
    size: number;
    created_at: string;
    expires_at: string;
  };
  uploadUrls: string[];
  isMultipart: boolean;
}

interface IProgress {
  totalBytes: number;
  uploadedBytes: number;
}

const PLATFORM_RULES = {
  crossclip: { size: 1024 * 1024 * 1024, types: ['.mp4'] },
  typestudio: { size: 1024 * 1024 * 1024 * 3.4, types: ['.mp4', '.mov', '.webm'] },
};

class SharedStorageServiceViews extends ViewHandler<{}> {
  getPlatformLink(platform: string, id: string) {
    if (platform === 'crossclip') {
      return `https://crossclip.streamlabs.com/storage/${id}`;
    }
    if (platform === 'typestudio') {
      return `https://podcasteditor.streamlabs.com/storage/${id}`;
    }
    if (platform === 'videoeditor') {
      return `https://videoeditor.streamlabs.com/import/${id}`;
    }
    return '';
  }
}

export class SharedStorageService extends Service {
  @Inject() userService: UserService;
  @Inject() hostsService: HostsService;
  @Inject() markersService: MarkersService;

  id: string;
  cancel: () => void;
  uploader: S3Uploader;
  uploading = false;

  get host() {
    return `https://${this.hostsService.streamlabs}/api/v5/slobs/streamlabs-storage`;
  }

  get views() {
    return new SharedStorageServiceViews({});
  }

  async uploadFile(
    filepath: string,
    onProgress?: (progress: IProgress) => void,
    onError?: (error: unknown) => void,
    platform?: string,
  ) {
    let uploadInfo;
    try {
      if (this.uploading) {
        throw new Error($t('Upload already in progress'));
      }
      this.uploading = true;
      uploadInfo = await this.prepareUpload(filepath, platform);
      this.id = uploadInfo.file.id;
      this.uploader = new S3Uploader({
        fileInfo: uploadInfo,
        filepath,
        onProgress,
        onError,
      });
      this.cancel = this.uploader.cancel;
    } catch (e: unknown) {
      onError(e);
    }
    return {
      cancel: this.cancelUpload.bind(this),
      complete: this.performUpload(filepath),
      size: uploadInfo?.file?.size,
    };
  }

  async performUpload(filepath: string) {
    const { uploaded, reqBody } = await this.uploadS3File();
    if (uploaded) {
      await this.completeUpload(reqBody);
      return await this.generateShare(filepath);
    } else {
      return Promise.reject('The upload was canceled');
    }
  }

  validateFile(filepath: string, platform?: string) {
    const stats = fs.lstatSync(filepath);
    // TODO: index
    // @ts-ignore
    if (platform && PLATFORM_RULES[platform]) {
      // TODO: index
      // @ts-ignore
      if (stats.size > PLATFORM_RULES[platform].size) {
        throw new Error($t('File is too large to upload'));
      }
      // TODO: index
      // @ts-ignore
      if (!PLATFORM_RULES[platform].types.includes(path.extname(filepath))) {
        throw new Error(
          $t('File type %{extension} is not supported', { extension: path.extname(filepath) }),
        );
      }
    }
    return { size: stats.size, name: path.basename(filepath) };
  }

  async completeUpload(body: { parts?: { number: number; tag: string }[] }) {
    const url = `${this.host}/storage/v1/temporary-files/${this.id}/complete`;
    const headers = authorizedHeaders(
      this.userService.apiToken,
      new Headers({ 'Content-Type': 'application/json' }),
    );
    return await jfetch(new Request(url, { headers, method: 'POST', body: JSON.stringify(body) }));
  }

  async cancelUpload() {
    if (!this.id || !this.cancel) return;
    const url = `${this.host}/storage/v1/temporary-files/${this.id}`;
    const headers = authorizedHeaders(this.userService.apiToken);
    this.cancel();
    this.id = undefined;
    this.cancel = undefined;
    this.uploading = false;
    return await jfetch(new Request(url, { headers, method: 'DELETE' }));
  }

  private async prepareUpload(filepath: string, platform?: string): Promise<IPrepareResponse> {
    try {
      const { size, name } = this.validateFile(filepath, platform);
      const url = `${this.host}/storage/v1/temporary-files`;
      const headers = authorizedHeaders(this.userService.apiToken);
      const body = new FormData();
      body.append('name', name);
      body.append('size', String(size));
      body.append('mime_type', 'video/mpeg');
      return await jfetch(new Request(url, { headers, body, method: 'POST' }));
    } catch (e: unknown) {
      this.uploading = false;
      // Signifies an API failure
      if (e.toString() === '[object Object]') {
        return Promise.reject('Error preparing storage upload');
      }
      return Promise.reject(e);
    }
  }

  private async uploadS3File() {
    return await this.uploader.start();
  }

  private async generateShare(filepath: string): Promise<{ id: string }> {
    if (!this.id) return;
    const { name, dir } = path.parse(filepath);
    const bookmarksFile = path.join(dir, `${name}_markers.csv`);
    let bookmarks;
    if (fs.existsSync(bookmarksFile)) bookmarks = await this.parseBookmarks(bookmarksFile);
    const url = `${this.host}/storage/v1/temporary-shares`;
    const headers = authorizedHeaders(
      this.userService.apiToken,
      new Headers({ 'Content-Type': 'application/json' }),
    );
    const body = JSON.stringify({
      temporary_file_id: this.id,
      type: 'video',
      metadata: { name, bookmarks },
    });
    this.uploading = false;
    return await jfetch(new Request(url, { method: 'POST', headers, body }));
  }

  private async parseBookmarks(filpath: string) {
    return await this.markersService.actions.return.parseCSV(filpath);
  }
}

interface IUploaderOptions {
  fileInfo: IPrepareResponse;
  filepath: string;
  onProgress?: (progress: IProgress) => void;
  onError?: (e: unknown) => void;
}

class S3Uploader {
  uploadedSize = 0;
  aborted = false;
  onProgress = (progress: IProgress) => {};
  onError = (e: unknown) => {};
  uploadUrls: string[] = [];
  isMultipart = false;
  chunkSize: number = null;
  size = 0;
  type = '';
  filepath = '';
  cancelRequested = false;
  parts: { number: number; tag: string }[] = [];

  constructor(opts: IUploaderOptions) {
    this.onProgress = opts.onProgress;
    this.onError = opts.onError;
    this.uploadUrls = opts.fileInfo.uploadUrls;
    this.isMultipart = opts.fileInfo.isMultipart;
    this.size = opts.fileInfo.file.size;
    this.chunkSize = this.isMultipart
      ? Math.max(Math.round(this.size / this.uploadUrls.length), 1024 * 1024 * 5)
      : this.size;
    this.type = opts.fileInfo.file.mime_type;
    this.filepath = opts.filepath;
    this.cancel = this.cancel.bind(this);
  }

  async start() {
    try {
      const file = await new Promise<number>((resolve, reject) => {
        fs.open(this.filepath, 'r', (err, fd) => {
          if (err) {
            reject(err);
          } else {
            resolve(fd);
          }
        });
      });

      const uploaded = await this.uploadChunks(file);
      const reqBody = this.isMultipart ? { parts: this.parts } : {};
      return { uploaded, reqBody };
    } catch (e: unknown) {
      this.onError(e);
    }
  }

  async uploadChunks(file: number) {
    try {
      for (const url of this.uploadUrls) {
        if (this.cancelRequested) return false;
        await this.uploadChunk(url, file);
      }
      return true;
    } catch (e: unknown) {
      this.onError(e);
    }
  }

  async uploadChunk(url: string, file: number) {
    const chunkSize = Math.min(this.size - this.uploadedSize, this.chunkSize);
    const readBuffer = Buffer.alloc(chunkSize);
    const bytesRead = await new Promise<number>((resolve, reject) => {
      fs.read(file, readBuffer, 0, chunkSize, null, (err, bytesRead) => {
        if (err) {
          reject(err);
        } else {
          resolve(bytesRead);
        }
      });
    });

    if (bytesRead !== chunkSize) {
      // Something went wrong, we didn't read as many bytes as expected
      throw new Error(
        `Did not read expected number of bytes from video, Expected: ${chunkSize} Actual: ${bytesRead}`,
      );
    }

    const headers = new Headers();
    headers.append('Content-Type', this.type);

    this.uploadedSize += chunkSize;

    const result = await fetch(
      new Request(url, {
        method: 'PUT',
        headers,
        body: new Blob([readBuffer]),
      }),
    );

    const tag = result?.headers?.get('ETag')?.replace(/"/g, '');

    this.parts.push({ number: this.parts.length + 1, tag });

    this.onProgress({
      totalBytes: this.size,
      uploadedBytes: this.uploadedSize,
    });
  }

  cancel() {
    this.cancelRequested = true;
  }
}
