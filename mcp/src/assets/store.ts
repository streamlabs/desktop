/**
 * Where generated assets live. Scene collections keep pointing at these files, so they go in a
 * stable folder (not temp), named by their content so the same request reuses the same file.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { encodePng } from './png.js';

export const ASSET_DIR = path.join(
  process.env.APPDATA ?? path.join(os.homedir(), '.config'),
  'streamlabs-mcp',
  'assets',
);

function fileFor(kind: string, params: unknown, ext: string): string {
  const hash = crypto.createHash('sha1').update(JSON.stringify(params)).digest('hex').slice(0, 12);
  return path.join(ASSET_DIR, `${kind}-${hash}.${ext}`);
}

/** A PNG drawn by `draw` (only when the file does not exist yet). Returns its path. */
export function pngAsset(
  kind: string,
  params: unknown,
  draw: () => { width: number; height: number; data: Uint8Array },
): string {
  const file = fileFor(kind, params, 'png');
  if (!fs.existsSync(file)) {
    fs.mkdirSync(ASSET_DIR, { recursive: true });
    const img = draw();
    fs.writeFileSync(file, encodePng(img.width, img.height, img.data));
  }
  return file;
}

/** A text file (an HTML page for a browser source). Returns its path. */
export function textAsset(
  kind: string,
  params: unknown,
  ext: string,
  content: () => string,
): string {
  const file = fileFor(kind, params, ext);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(ASSET_DIR, { recursive: true });
    fs.writeFileSync(file, content(), 'utf8');
  }
  return file;
}
