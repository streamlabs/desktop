import { isAbsolute, relative, basename, dirname, resolve } from 'path';
import * as remote from '@electron/remote';
import { ISourceInfo } from './sources';

function getPresetBasePath() {
  const execFile = basename(process.execPath).toLowerCase();
  const isPackaged = execFile !== 'electron.exe';

  const APP_PATH = remote.app.getAppPath();
  const EXE_DIR_PATH = dirname(remote.app.getPath('exe'));
  return isPackaged ? EXE_DIR_PATH : APP_PATH;
}

/**
 * export for testing
 * JSONから読みだしたパスのうちプリセットと判定できるものを、実際にOBSに渡すパスに変換する
 */
export function convertPresetPath(
  pathMaybePreset: string,
  presetBasePath = getPresetBasePath(),
): string {
  if (isAbsolute(pathMaybePreset)) {
    return pathMaybePreset;
  }

  // This is enough to detect that it's not a preset file
  const isOuterPath = pathMaybePreset.startsWith('..');
  if (isOuterPath) {
    return pathMaybePreset;
  }

  const absolutePath = resolve(presetBasePath, pathMaybePreset);
  return absolutePath;
}

/**
 * export for testing
 * プリセットのファイルを参照するパスを、JSONに書き出す用の相対パスに変換する
 */
export function revertPresetPath(
  pathMaybePreset: string,
  presetBasePath = getPresetBasePath(),
): string {
  if (!isAbsolute(pathMaybePreset)) {
    return pathMaybePreset;
  }

  const relativePath = relative(presetBasePath, pathMaybePreset);
  // Files in another drive or in a network drive
  if (isAbsolute(relativePath)) {
    return pathMaybePreset;
  }

  // This is enough to detect that it's not a preset file
  const isOuterPath = relativePath.startsWith('..');
  if (isOuterPath) {
    return pathMaybePreset;
  }

  return relativePath;
}

/** プリセットのファイル参照をつねにexeから相対パスとして解釈する */
export function applyPathConvertForPreset(
  sourceType: ISourceInfo['type'],
  settings: ISourceInfo['settings'],
): ISourceInfo['settings'] {
  if (sourceType === 'image_source' && typeof settings.file === 'string') {
    settings.file = convertPresetPath(settings.file);
  }
  return settings;
}

export function unapplyPathConvertForPreset(
  sourceType: ISourceInfo['type'],
  settings: ISourceInfo['settings'],
): ISourceInfo['settings'] {
  if (sourceType === 'image_source' && typeof settings.file === 'string') {
    settings.file = revertPresetPath(settings.file);
  }
  return settings;
}
