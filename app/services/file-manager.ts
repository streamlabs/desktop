import { Service } from './core/service';
import path from 'path';
import fs from 'fs';

interface IFlushWaiter {
  resolve: () => void;
  reject: (error: unknown) => void;
}

interface IFile {
  data: string;
  locked: boolean;
  version: number;
  dirty: boolean;

  /**
   * Used during shutdown to coordinate flushing fully finished
   * before shutting down.
   */
  flushWaiters?: IFlushWaiter[];
}

export interface IFileReadOptions {
  // If true, will attempt to validate that valid
  // JSON was read, and will retry/fail if not.
  validateJSON?: boolean;

  // The number of times to retry
  retries?: number;
}

/**
 * This service provides an atomic, race-condition-free
 * file I/O system.  It supports instaneous synchronous
 * reads and writes of files under management.  It does
 * this by storing a copy of all files in memory, and
 * asynchronously flushing them to disk.  This obviously
 * has the downside of being memory intensive, and should
 * only be used for small files where atomicity and
 * performance are important.
 */
export class FileManagerService extends Service {
  private files: Dictionary<IFile> = {};

  async exists(filePath: string): Promise<boolean> {
    const truePath = path.resolve(filePath);

    if (this.files[truePath]) return Promise.resolve(true);
    return this.fileExists(truePath);
  }

  write(filePath: string, data: string) {
    const truePath = path.resolve(filePath);
    const file = this.files[truePath];

    if (file) {
      file.data = data;
      file.version += 1;
      file.dirty = true;
    } else {
      this.files[truePath] = {
        data,
        locked: false,
        version: 0,
        dirty: true,
      };
    }

    this.flush(truePath);
  }

  read(filePath: string, options: IFileReadOptions = {}): string {
    const truePath = path.resolve(filePath);
    let file = this.files[truePath];

    const opts = {
      validateJSON: false,
      retries: 0,
      ...options,
    };

    // If this is the first read of this file, do a blocking synchronous read
    if (!file) {
      let data: string;

      try {
        data = fs.readFileSync(truePath).toString();

        if (opts.validateJSON) {
          JSON.parse(data);
        }
      } catch (e: unknown) {
        if (opts.retries > 0) {
          this.read(filePath, {
            ...opts,
            retries: opts.retries - 1,
          });
        } else {
          throw e;
        }
      }

      file = this.files[truePath] = {
        data,
        locked: false,
        version: 0,
        dirty: false,
      };
    }

    return file.data;
  }

  copy(sourcePath: string, destPath: string) {
    const trueSource = path.resolve(sourcePath);
    const trueDest = path.resolve(destPath);

    this.files[trueDest] = {
      data: this.read(trueSource),
      locked: false,
      version: 0,
      dirty: true,
    };

    this.flush(trueDest);
  }

  /**
   * Ensures that all dirty files have been flushed.  Should only
   * be called before shutdown.
   */
  async flushAll() {
    const attemptedVersions: Dictionary<number> = {};
    const failures: { filePath: string; error: unknown }[] = [];

    while (true) {
      const dirtyFiles = Object.entries(this.files).filter(([, file]) => file.dirty);
      if (!dirtyFiles.length) return;

      // Revisit the file list after every batch. This catches files created or rewritten while
      // another file was still flushing, without retrying the same failed version forever.
      const pendingFiles = dirtyFiles.filter(
        ([filePath, file]) => file.locked || attemptedVersions[filePath] !== file.version,
      );
      if (!pendingFiles.length) break;

      await Promise.all(
        pendingFiles.map(async ([filePath, file]) => {
          const version = file.version;
          attemptedVersions[filePath] = version;

          try {
            await this.waitForFlush(filePath, file);
            const previousFailure = failures.findIndex(failure => failure.filePath === filePath);
            if (previousFailure !== -1) failures.splice(previousFailure, 1);
          } catch (error: unknown) {
            const previousFailure = failures.find(failure => failure.filePath === filePath);
            if (previousFailure) {
              previousFailure.error = error;
            } else {
              failures.push({ filePath, error });
            }
          }
        }),
      );
    }

    if (failures.length) {
      throw new Error(
        `Failed to flush ${failures.length} file(s): ${failures
          .map(failure => failure.filePath)
          .join(', ')}`,
      );
    }
  }

  private waitForFlush(filePath: string, file: IFile): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!file.flushWaiters) file.flushWaiters = [];
      file.flushWaiters.push({ resolve, reject });

      // A previous background flush may already have exhausted its retries before shutdown
      // began. Restart it now that flushAll has installed completion observers.
      if (!file.locked) this.flush(filePath);
    });
  }

  private async flush(filePath: string, tries = 10) {
    const file = this.files[filePath];

    // Current flush attempt will realize it wrote out
    // of date data and re-run.
    if (file.locked) return;

    file.locked = true;
    const version = file.version;

    try {
      await this.writeFile(filePath, file.data);

      if (version !== file.version) {
        throw new Error('Wrote out of date file!  Will retry...');
      }

      file.locked = false;
      file.dirty = false;
      this.notifyFlushFinished(file);
      console.debug(`Wrote file ${filePath} version ${version}`);
    } catch (e: unknown) {
      if (tries > 0) {
        file.locked = false;
        await this.flush(filePath, tries - 1);
      } else {
        file.locked = false;
        this.notifyFlushFinished(file, e);
        console.error(`Ran out of retries writing ${filePath}`, e);
      }
    }
  }

  private notifyFlushFinished(file: IFile, error?: unknown) {
    const flushWaiters = file.flushWaiters || [];
    file.flushWaiters = [];

    flushWaiters.forEach(waiter => {
      error === undefined ? waiter.resolve() : waiter.reject(error);
    });
  }

  /**
   * Checks if a file exists
   * @param filePath a path to the file
   */
  private fileExists(filePath: string): Promise<boolean> {
    return new Promise(resolve => {
      fs.exists(filePath, exists => resolve(exists));
    });
  }

  /**
   * Writes data to a file atomically
   * @param filePath a path to the file
   * @param data The data to write
   */
  private writeFile(filePath: string, data: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tmpPath = `${filePath}.tmp`;

      fs.writeFile(tmpPath, data, err => {
        if (err) {
          reject(err);
          return;
        }

        fs.rename(tmpPath, filePath, err => {
          if (err) {
            reject(err);
            return;
          }

          resolve();
        });
      });
    });
  }
}
