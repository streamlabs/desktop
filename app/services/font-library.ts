import { Service } from './core/service';
import path from 'path';
import fs from 'fs';
import https from 'https';
import crypto from 'crypto';
import { IncomingMessage } from 'http';
import { pipeline } from 'stream';
import electron from 'electron';
import { AppService } from 'services/app';
import { Inject } from 'services/core/injector';
import { jfetch } from 'util/requests';

export interface IFamilyWithStyle {
  family: IFontFamily;
  style: IFontStyle;
}

export interface IFontStyle {
  name: string;
  file: string;
}

export interface IFontFamily {
  name: string;
  styles: IFontStyle[];
}

export interface IFontManifest {
  families: IFontFamily[];
}

export class FontLibraryService extends Service {
  private manifest: IFontManifest;

  @Inject() appService: AppService;

  // Used to prevent downloading the same font multiple times
  fontDownloadPromises: Dictionary<Promise<string>> = {};

  getManifest(): Promise<IFontManifest> {
    if (!this.manifest) {
      const req = new Request(this.libraryUrl('manifest.json'));

      return jfetch<IFontManifest>(req, null, { forceJson: true })
        .then(json => {
          this.manifest = json;
          return json;
        })
        .catch(() => {
          return { families: [] };
        });
    }

    return Promise.resolve(this.manifest);
  }

  findFamily(family: string): Promise<IFontFamily> {
    return this.getManifest().then(manifest => {
      return manifest.families.find(fam => fam.name === family);
    });
  }

  findStyle(family: string, style: string): Promise<IFontStyle> {
    return this.findFamily(family).then(fam => {
      return fam.styles.find(sty => sty.name === style);
    });
  }

  // Finds family and style info about a given font path
  lookupFontInfo(fontPath: string): Promise<{ family: string; style: string }> {
    return this.getManifest().then(manifest => {
      let family: string;
      let style: string;

      const file = path.parse(fontPath).base;

      manifest.families.find(fam => {
        return !!fam.styles.find(sty => {
          if (sty.file === file) {
            family = fam.name;
            style = sty.name;

            return true;
          }
        });
      });

      return { family, style };
    });
  }

  /**
   * Returns the cached font path after the complete download has been published.
   * Network, HTTP and filesystem failures reject the promise and allow a later retry.
   */
  downloadFont(file: string): Promise<string> {
    const fontPath = this.libraryPath(file);

    if (this.fontDownloadPromises[file]) return this.fontDownloadPromises[file];

    // Don't re-download the font if we have already downloaded it
    if (fs.existsSync(fontPath)) {
      this.fontDownloadPromises[file] = Promise.resolve(fontPath);
      return this.fontDownloadPromises[file];
    }

    const download = async (): Promise<string> => {
      this.ensureFontsDirectory();
      const temporaryPath = `${fontPath}.${crypto.randomBytes(6).toString('hex')}.download`;

      try {
        const response = await new Promise<IncomingMessage>((resolve, reject) => {
          https
            .get(this.libraryUrl(file), response => {
              response.on('error', reject);
              resolve(response);
            })
            .on('error', reject);
        });

        if (response.statusCode !== 200) {
          response.resume();
          throw new Error(`Font download failed with HTTP ${response.statusCode}`);
        }

        await new Promise<void>((resolve, reject) => {
          pipeline(response, fs.createWriteStream(temporaryPath), error =>
            error ? reject(error) : resolve(),
          );
        });
        await fs.promises.rename(temporaryPath, fontPath);
        return fontPath;
      } catch (error: unknown) {
        // Preserve the download error if cleanup also fails. The published font is untouched.
        await fs.promises.unlink(temporaryPath).catch(() => {});
        throw error;
      }
    };

    this.fontDownloadPromises[file] = download().catch(error => {
      delete this.fontDownloadPromises[file];
      throw error;
    });

    return this.fontDownloadPromises[file];
  }

  private ensureFontsDirectory() {
    if (!fs.existsSync(this.fontsDirectory)) {
      fs.mkdirSync(this.fontsDirectory);
    }
  }

  private get fontsDirectory() {
    return path.join(this.appService.appDataDirectory, 'Fonts');
  }

  // Create a local font library path from a filename
  private libraryPath(file: string) {
    return path.join(this.fontsDirectory, file);
  }

  // Create an s3 font library url from a filename
  private libraryUrl(file: string) {
    return `https://d1g6eog1uhe0xm.cloudfront.net/fonts/${file}`;
  }
}
