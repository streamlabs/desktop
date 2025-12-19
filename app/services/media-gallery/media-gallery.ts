import fs from 'fs';
import { Inject } from '../core/injector';
import { authorizedHeaders, downloadFile } from '../../util/requests';
import { Service } from 'services/core/service';
import { UserService } from 'services/user';
import { HostsService } from 'services/hosts';
import { WindowsService } from 'services/windows';
import uuid from 'uuid';
import { $t } from '../i18n';
import { jfetch } from 'util/requests';

export interface IMediaGalleryFile {
  href: string;
  filename: string;
  size: number;
  type: string;
  isStock: boolean;
  prime?: boolean;
}

interface IMediaGalleryLimits {
  maxUsage: number;
  maxFileSize: number;
}

export interface IMediaGalleryInfo extends IMediaGalleryLimits {
  files: IMediaGalleryFile[];
  totalUsage: number;
}

interface IMediaGalleryProps {
  filter: 'audio' | 'image';
}

const fileTypeMap: Dictionary<string> = {
  mp3: 'audio',
  wav: 'audio',
  ogg: 'audio',
  jpg: 'image',
  png: 'image',
  gif: 'image',
  jpeg: 'image',
  webm: 'image',
  svg: 'image',
  mp4: 'video',
};

const DEFAULT_MAX_USAGE = 1024 * Math.pow(1024, 2);
const DEFAULT_MAX_FILE_SIZE = 50 * Math.pow(1024, 2);

export class MediaGalleryService extends Service {
  @Inject() private userService: UserService;
  @Inject() private hostsService: HostsService;
  @Inject() private windowsService: WindowsService;

  private promises: Dictionary<{
    resolve: (value?: IMediaGalleryFile) => void;
    reject: () => void;
  }> = {};

  async fetchGalleryInfo(): Promise<IMediaGalleryInfo> {
    const [uploads, limits, stockMedia] = await Promise.all([
      this.fetchFiles(),
      this.fetchFileLimits(),
      this.fetchStockMedia(),
    ]);
    const files = uploads.concat(stockMedia.audios, stockMedia.images);
    const totalUsage = uploads.reduce(
      (size: number, file: IMediaGalleryFile) => size + Number(file.size),
      0,
    );
    return { files, totalUsage, ...limits };
  }

  async pickFile(props?: IMediaGalleryProps): Promise<IMediaGalleryFile> {
    const promiseId = uuid();
    const promise = new Promise<IMediaGalleryFile>((resolve, reject) => {
      this.promises[promiseId] = { resolve, reject };
    });
    this.showMediaGallery(promiseId, props);
    return promise;
  }

  resolveFileSelect(promiseId: string, file: IMediaGalleryFile) {
    this.promises[promiseId].resolve(file);
    delete this.promises[promiseId];
    return file;
  }

  async upload(filePaths: string[]): Promise<IMediaGalleryInfo> {
    const formData = new FormData();
    filePaths.forEach((path: string) => {
      const contents = fs.readFileSync(path);
      const name = path.split('\\').pop();
      const ext = name.toLowerCase().split('.').pop();
      const file = new File([contents], name, { type: `${fileTypeMap[ext]}/${ext}` });
      formData.append('uploads[]', file);
    });

    const req = this.formRequest('api/v5/slobs/uploads', {
      body: formData,
      method: 'POST',
    });

    await jfetch(req);
    return this.fetchGalleryInfo();
  }

  async downloadFile(filename: string, file: IMediaGalleryFile): Promise<void> {
    return downloadFile(file.href, filename);
  }

  async deleteFile(file: IMediaGalleryFile): Promise<IMediaGalleryInfo> {
    const a = document.createElement('a');
    a.href = file.href;
    const path = a.pathname;

    const req = this.formRequest(`api/v5/slobs/uploads${path}`, { method: 'DELETE' });
    await fetch(req);
    return this.fetchGalleryInfo();
  }

  private showMediaGallery(promiseId: string, props?: IMediaGalleryProps) {
    this.windowsService.showWindow({
      componentName: 'MediaGallery',
      title: $t('Media Gallery'),
      preservePrevWindow: true,
      queryParams: { promiseId, ...props },
      size: {
        width: 1100,
        height: 680,
      },
    });
  }

  private formRequest(endpoint: string, options?: any) {
    const host = this.hostsService.streamlabs;
    const headers = authorizedHeaders(this.userService.apiToken);
    const url = `https://${host}/${endpoint}`;
    return new Request(url, { ...options, headers });
  }

  private async fetchStockMedia(): Promise<{
    audios: Array<IMediaGalleryFile>;
    images: Array<IMediaGalleryFile>;
  }> {
    const req = this.formRequest('api/v5/slobs/widget/alertbox/stock-media?alerts_panels=true');
    return jfetch(req);
  }

  private async fetchFiles(): Promise<IMediaGalleryFile[]> {
    const req = this.formRequest('api/v5/slobs/uploads');
    const files: { href: string; size?: number }[] = await jfetch(req);

    const uploads = files.map(item => {
      const filename = decodeURIComponent(item.href.split(/[\\/]/).pop());
      const ext = filename.toLowerCase().split('.').pop();
      const type = fileTypeMap[ext] === 'video' ? 'image' : fileTypeMap[ext];
      const size = item.size || 0;

      return { ...item, filename, type, size, isStock: false };
    });

    return uploads;
  }

  private async fetchFileLimits(): Promise<IMediaGalleryLimits> {
    const req = this.formRequest('api/v5/slobs/user/filelimits');
    try {
      return await fetch(req).then((rawRes: any) => {
        const resp = rawRes.json();
        return {
          maxUsage: resp.body.max_allowed_upload_usage,
          maxFileSize: resp.body.max_allowed_upload_fize_size,
        };
      });
    } catch (e: unknown) {
      return {
        maxUsage: DEFAULT_MAX_USAGE,
        maxFileSize: DEFAULT_MAX_FILE_SIZE,
      };
    }
  }
}
