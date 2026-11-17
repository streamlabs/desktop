import { Service } from 'services/core/service';
import { Inject } from 'services/core/injector';
import { WindowsService } from 'services/windows';
import { AppService } from 'services/app';
import { getOS, OS } from 'util/operating-systems';
import fs from 'fs';
import path from 'path';
import uuid from 'uuid/v4';

/**
 * Single-frame captures of Streamlabs' own windows, for the desktop MCP server's
 * capture_screen tool.
 *
 * Deliberately internal, not part of the documented external API: that surface "must not have
 * breaking changes" (external-api.ts), and this is a prototype. It is still reachable over the
 * pipe through the internal-service fallback, the same way EditorCommandsService is.
 *
 * Why the ":0". getMediaSourceId() returns "window:<HWND>:1", and a nonzero last field tells
 * Chromium the window is its own, so it copies its own compositor output instead of asking the
 * OS. That output does not contain the OBS preview, which is a native child window rendered by
 * another process -- the preview area comes back as the page background. Rewriting the field
 * to ":0" makes Chromium capture the window like any foreign window, through Windows Graphics
 * Capture, which sees the composited result including the preview and works while the window
 * is covered. WGC cannot capture a minimized window.
 *
 * Frames go to disk rather than back over the pipe: base64 inside the JSON-RPC response would
 * be walked by the MCP server's secret redaction, which pattern-matches long strings.
 */

/** Not in TypeScript's DOM typings. Only the part used here. */
interface IImageCapture {
  grabFrame(): Promise<ImageBitmap>;
}
declare const ImageCapture: { new (track: MediaStreamTrack): IImageCapture };

export interface ICapturedWindow {
  window: 'main' | 'child';
  /** The child window's current component, e.g. "SourceProperties". Empty for main. */
  component: string;
  path: string;
  width: number;
  height: number;
  bytes: number;
}

export interface ICaptureResult {
  captures: ICapturedWindow[];
  /** Windows that were deliberately or unavoidably left out, and why. */
  skipped: string[];
}

/** Child-window components never captured: Settings renders the stream key in plain text. */
const DENIED_COMPONENTS = ['Settings'];

/** Anything older is an orphan from a capture the MCP server never collected. */
const STALE_MS = 5 * 60 * 1000;

const GRAB_TIMEOUT_MS = 5000;

const MINIMIZED =
  'Streamlabs is minimized, so there is nothing to capture. Ask the streamer to restore the window.';

export class CaptureService extends Service {
  @Inject() windowsService: WindowsService;
  @Inject() appService: AppService;

  get captureDirectory() {
    return path.join(this.appService.appDataDirectory, 'captures');
  }

  async capture(maxWidth = 1280): Promise<ICaptureResult> {
    if (getOS() !== OS.Windows) {
      throw new Error('Window capture is only implemented on Windows.');
    }

    const main = this.windowsService.windows.main;
    if (main.isMinimized()) throw new Error(MINIMIZED);

    await fs.promises.mkdir(this.captureDirectory, { recursive: true });
    this.reapStale();

    const captures: ICapturedWindow[] = [await this.captureWindow(main, 'main', '', maxWidth)];
    const skipped: string[] = [];

    // A dialog lives in a separate top-level window, invisible to a capture of main -- and when
    // one is open it is usually the thing that matters (a Go Live error, Source Properties).
    const child = this.windowsService.state.child;
    if (child.isShown && child.componentName) {
      if (DENIED_COMPONENTS.includes(child.componentName)) {
        skipped.push(
          `The ${child.componentName} window is open and was not captured, because it can show the stream key.`,
        );
      } else {
        try {
          captures.push(
            await this.captureWindow(
              this.windowsService.windows.child,
              'child',
              child.componentName,
              maxWidth,
            ),
          );
        } catch (e: unknown) {
          skipped.push(`The ${child.componentName} window could not be captured: ${message(e)}`);
        }
      }
    }

    return { captures, skipped };
  }

  private async captureWindow(
    win: Electron.BrowserWindow,
    name: 'main' | 'child',
    component: string,
    maxWidth: number,
  ): Promise<ICapturedWindow> {
    const sourceId = win.getMediaSourceId().replace(/:\d+$/, ':0');

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        // Chromium's legacy desktop-capture constraint, absent from the standard typings.
        video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId } },
      } as MediaStreamConstraints);
    } catch (e: unknown) {
      // The window was minimized between the check and the capture, or is otherwise not drawn.
      if (e instanceof Error && e.name === 'NotReadableError') throw new Error(MINIMIZED);
      throw e;
    }

    let frame: ImageBitmap;
    try {
      frame = await withTimeout(
        new ImageCapture(stream.getVideoTracks()[0]).grabFrame(),
        GRAB_TIMEOUT_MS,
        'Timed out waiting for a frame.',
      );
    } finally {
      stream.getTracks().forEach(t => t.stop());
    }

    const scale = Math.min(1, maxWidth / frame.width);
    const width = Math.round(frame.width * scale);
    const height = Math.round(frame.height * scale);

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(frame, 0, 0, width, height);
    frame.close();

    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
    const data = Buffer.from(await blob.arrayBuffer());
    const file = path.join(this.captureDirectory, `${uuid()}.jpg`);
    await fs.promises.writeFile(file, data);

    return { window: name, component, path: file, width, height, bytes: data.length };
  }

  /** Backstop: the MCP server deletes each file once read, but it may have died first. */
  private reapStale() {
    const now = Date.now();
    fs.promises
      .readdir(this.captureDirectory)
      .then(files =>
        Promise.all(
          files.map(async f => {
            const p = path.join(this.captureDirectory, f);
            const { mtimeMs } = await fs.promises.stat(p);
            if (now - mtimeMs > STALE_MS) await fs.promises.unlink(p);
          }),
        ),
      )
      .catch(() => {});
  }
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function withTimeout<T>(p: Promise<T>, ms: number, reason: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(reason)), ms)),
  ]);
}
