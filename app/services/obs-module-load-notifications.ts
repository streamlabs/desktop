import type * as ObsStudioNode from 'obs-studio-node';
import type { ISceneCollectionSchema } from 'services/scene-collections';

export type IObsModuleLoadFailure = ObsStudioNode.IObsModuleLoadFailure;

export const NDI_RUNTIME_VERSION_MISMATCH: typeof ObsStudioNode.NDI_RUNTIME_VERSION_MISMATCH =
  'NDI_RUNTIME_VERSION_MISMATCH';
export const NDI_RUNTIME_NOT_FOUND: typeof ObsStudioNode.NDI_RUNTIME_NOT_FOUND =
  'NDI_RUNTIME_NOT_FOUND';

export const NDI_RUNTIME_FAILURE_CODES: readonly string[] = [
  NDI_RUNTIME_VERSION_MISMATCH,
  NDI_RUNTIME_NOT_FOUND,
];

function normalizeModuleName(moduleName: string): string {
  return (moduleName || '').replace(/\.(dll|so|dylib)$/i, '').toLowerCase();
}

function isObsNdiRuntimeFailure(failure: IObsModuleLoadFailure): boolean {
  return (
    normalizeModuleName(failure.module) === 'obs-ndi' &&
    NDI_RUNTIME_FAILURE_CODES.includes(failure.code)
  );
}

export function findNdiRuntimeVersionMismatch(
  failures: IObsModuleLoadFailure[],
): IObsModuleLoadFailure | null {
  return (
    failures.find(failure => {
      return (
        normalizeModuleName(failure.module) === 'obs-ndi' &&
        failure.code === NDI_RUNTIME_VERSION_MISMATCH
      );
    }) || null
  );
}

export function findNdiRuntimeLoadFailure(
  failures: IObsModuleLoadFailure[],
): IObsModuleLoadFailure | null {
  return failures.find(isObsNdiRuntimeFailure) || null;
}

export function getNdiRuntimeNotificationMessage(code: string): string {
  if (code === NDI_RUNTIME_NOT_FOUND) {
    return 'NDI Runtime was not found. Install NDI Tools to use NDI sources and outputs.';
  }

  return 'NDI Runtime 6 or newer is required for NDI sources and outputs. Click to download the latest NDI Runtime.';
}

export function activeSceneCollectionHasNdiSources(
  sceneCollections: ISceneCollectionSchema[],
  activeCollectionId?: string,
): boolean {
  if (!activeCollectionId) return false;

  const activeCollection = sceneCollections.find(
    collection => collection.id === activeCollectionId,
  );
  return activeCollection?.sources.some(source => source.type === 'ndi_source') || false;
}

export function shouldShowNdiRuntimeNotification(
  failures: IObsModuleLoadFailure[],
  sceneCollections: ISceneCollectionSchema[],
  activeCollectionId?: string,
): boolean {
  return (
    !!findNdiRuntimeLoadFailure(failures) &&
    activeSceneCollectionHasNdiSources(sceneCollections, activeCollectionId)
  );
}
