import { Service } from './core/service';
import { UserService } from './user';
import { Inject } from './core/injector';
import electron from 'electron';
import fs from 'fs';
import path from 'path';
import os from 'os';
import compact from 'lodash/compact';
import { AppService } from 'services/app';
import { Archiver } from 'archiver';
import { importArchiver, importAwsSdk } from '../util/slow-imports';

export class CacheUploaderService extends Service {
  @Inject() userService: UserService;
  @Inject() appService: AppService;

  get cacheDir() {
    return this.appService.appDataDirectory;
  }

  uploadCache(): Promise<string> {
    return new Promise(async resolve => {
      const cacheDir = this.cacheDir;
      const dateStr = new Date().toISOString();
      const username = this.userService.username;
      const keyname = `${compact([dateStr, username]).join('-')}.zip`;
      const cacheFile = path.join(os.tmpdir(), 'slobs-cache.zip');
      const output = fs.createWriteStream(cacheFile);

      // import of archiver takes to much time on startup so make a dynamic import
      const archiver = (await importArchiver()).default;
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', async () => {
        const file = fs.createReadStream(cacheFile);
        // import of aws-sdk takes ~400-500ms so make a dynamic import
        const AWS = await importAwsSdk();
        AWS.config.region = 'us-east-2';

        AWS.config.credentials = new AWS.CognitoIdentityCredentials({
          IdentityPoolId: 'e848f7ca-eba7-4132-b595-55d651f058d5',
        });

        const upload = new AWS.S3.ManagedUpload({
          params: {
            Bucket: 'streamlabs-obs-user-cache',
            Key: keyname,
            Body: file,
          },
        });

        upload.promise().then(() => {
          resolve(keyname);
        });
      });

      // Modify the stream key in service.json in a reversible way when uploading user caches
      // to avoid accidentally streaming to a customer's account when debugging
      const serviceJson = JSON.parse(
        fs.readFileSync(path.join(this.cacheDir, 'service.json'), 'utf8'),
      );
      serviceJson.settings.key = `[delete_me]${serviceJson.settings.key}`;
      fs.writeFileSync(
        path.join(this.cacheDir, 'service-protected.json'),
        JSON.stringify(serviceJson, null, 2),
      );

      archive.pipe(output);
      this.addDirIfExists(archive, 'node-obs');
      this.addDirIfExists(archive, 'SceneConfigs');
      this.addDirIfExists(archive, 'SceneCollections');
      this.addDirIfExists(archive, 'Streamlabels');
      this.addFileIfExists(archive, 'app.log');
      this.addFileIfExists(archive, 'crash-handler.log');
      this.addFileIfExists(archive, 'crash-handler.log.old');
      this.addFileIfExists(archive, 'game-overlays.log');
      this.addFileIfExists(archive, 'game-overlays.log.old');
      this.addFileIfExists(archive, 'long_calls.txt');
      archive.file(path.join(cacheDir, 'basic.ini'), { name: 'basic.ini' });
      archive.file(path.join(cacheDir, 'global.ini'), { name: 'global.ini' });
      archive.file(path.join(cacheDir, 'service-protected.json'), { name: 'service.json' });
      archive.file(path.join(cacheDir, 'streamEncoder.json'), { name: 'streamEncoder.json' });
      archive.file(path.join(cacheDir, 'recordEncoder.json'), { name: 'recordEncoder.json' });
      archive.file(path.join(cacheDir, 'window-state.json'), { name: 'window-state.json' });
      archive.file(path.join(cacheDir, 'persistent.realm'), { name: 'persistent.realm' });
      archive.file(path.join(cacheDir, 'ephemeral-copy.realm'), { name: 'ephemeral-copy.realm' });
      archive.finalize();
    });
  }

  private addDirIfExists(archive: Archiver, name: string) {
    const dirPath = path.join(this.cacheDir, name);

    if (fs.existsSync(dirPath)) {
      archive.directory(dirPath, name);
    }
  }

  private addFileIfExists(archive: Archiver, name: string) {
    const dirPath = path.join(this.cacheDir, name);

    if (fs.existsSync(dirPath)) {
      archive.file(dirPath, { name });
    }
  }
}
