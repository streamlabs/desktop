import { reportNodeLoadError, SceneCollectionIndeterminateLoadError } from './load-errors';

export interface ISceneCollectionSourceCreationRequest {
  readonly name: string;
  readonly type: string;
}

export class SceneCollectionSourceCreationError extends SceneCollectionIndeterminateLoadError {
  constructor(readonly sources: readonly ISceneCollectionSourceCreationRequest[]) {
    super(
      `Failed to create ${sources.length} scene collection source(s): ${sources
        .map(source => `${source.name} (${source.type})`)
        .join(', ')}`,
    );
    this.name = 'SceneCollectionSourceCreationError';
  }
}

/**
 * Reconciles OSN's bulk-create result with the requested scene collection sources. Missing inputs
 * remain recoverable during normal loads, but block persistence of an incomplete migration.
 */
export function reportUncreatedSceneCollectionSources(
  requestedSources: readonly ISceneCollectionSourceCreationRequest[],
  createdSources: readonly { name: string }[],
): ISceneCollectionSourceCreationRequest[] {
  const createdSourceNames = new Set(createdSources.map(source => source.name));
  const missingSources = requestedSources.filter(source => !createdSourceNames.has(source.name));

  if (missingSources.length > 0) {
    reportNodeLoadError(new SceneCollectionSourceCreationError(missingSources));
  }

  return missingSources;
}
