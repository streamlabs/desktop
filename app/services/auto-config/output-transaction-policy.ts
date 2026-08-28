import {
  autoOptimizerAcceptedBaseResolution,
  autoOptimizerPromotesResolution,
} from './resolution-policy';

export interface IOutputFormParameterLike {
  name: string;
  value?: unknown;
}

export interface IOutputFormGroupLike {
  nameSubCategory: string;
  parameters: IOutputFormParameterLike[];
}

export type TRawOutputValues = Record<string, unknown>;

/**
 * Twitch always owns bitrate and encoder settings for Enhanced Broadcasting,
 * but a successful active workload test still authorizes Desktop to apply the
 * exact tested resolution and shared frame rate. Estimate-only provider-owned
 * results remain non-mutating.
 */
export function shouldApplyAutoOptimizerVideoSettings(
  topology: string,
  providerOwnsEncoding: boolean,
  measurementModes: string[],
): boolean {
  return (
    !providerOwnsEncoding ||
    (topology === 'enhanced-broadcasting' &&
      measurementModes.length > 0 &&
      measurementModes.every(mode => mode === 'active'))
  );
}

interface IAutoOptimizerVideoSettingsLike {
  baseWidth: number;
  baseHeight: number;
  outputWidth: number;
  outputHeight: number;
  fpsNum: number;
  fpsDen: number;
}

interface IAutoOptimizerVideoResultLike {
  display: 'horizontal' | 'vertical' | 'both';
  resolution: { width: number; height: number };
}

export type TAutoOptimizerVideoPatches = Partial<
  Record<'horizontal' | 'vertical', Partial<IAutoOptimizerVideoSettingsLike>>
>;

/** Build the serialized video-only transaction; Output bitrate/encoder are intentionally absent. */
export function buildAutoOptimizerVideoSettingsPatches(
  legs: IAutoOptimizerVideoResultLike[],
  current: Partial<Record<'horizontal' | 'vertical', IAutoOptimizerVideoSettingsLike>>,
  fpsNum: number,
  fpsDen: number,
): TAutoOptimizerVideoPatches {
  const patches: TAutoOptimizerVideoPatches = {};
  legs.forEach(leg => {
    const display = leg.display === 'vertical' ? 'vertical' : 'horizontal';
    const video = current[display];
    if (!video) return;
    const promotesResolution = autoOptimizerPromotesResolution(
      video.outputWidth,
      video.outputHeight,
      leg.resolution.width,
      leg.resolution.height,
    );
    const base = promotesResolution
      ? autoOptimizerAcceptedBaseResolution(
          video.baseWidth,
          video.baseHeight,
          leg.resolution.width,
          leg.resolution.height,
        )
      : { width: video.baseWidth, height: video.baseHeight };
    patches[display] = {
      baseWidth: base.width,
      baseHeight: base.height,
      outputWidth: leg.resolution.width,
      outputHeight: leg.resolution.height,
    };
  });
  (['horizontal', 'vertical'] as const).forEach(display => {
    if (!current[display]) return;
    patches[display] = { ...patches[display], fpsNum, fpsDen };
  });
  return patches;
}

/** Simple mode can hide the selected encoder's preset when UseAdvanced is off. */
export function shouldCaptureTargetPresetForRollback(mode: 'Simple' | 'Advanced'): boolean {
  return mode === 'Simple';
}

function fieldKey(group: string, name: string): string {
  return `${group}\u0000${name}`;
}

/** Snapshot every raw value exposed by the active Output configuration. */
export function captureRawOutputValues(
  formData: IOutputFormGroupLike[],
): TRawOutputValues {
  const values: TRawOutputValues = {};
  formData.forEach(group => {
    group.parameters.forEach(parameter => {
      values[fieldKey(group.nameSubCategory, parameter.name)] = parameter.value;
    });
  });
  return values;
}

/** Compare raw values, including fields omitted from the high-level settings model. */
export function rawOutputValuesMatch(
  expected: TRawOutputValues,
  formData: IOutputFormGroupLike[],
): boolean {
  const actual = captureRawOutputValues(formData);
  const expectedKeys = Object.keys(expected);
  const actualKeys = Object.keys(actual);
  if (expectedKeys.length !== actualKeys.length) return false;
  return expectedKeys.every(
    key => Object.prototype.hasOwnProperty.call(actual, key) && actual[key] === expected[key],
  );
}

/** Include the target encoder's normally dormant preset in rollback verification. */
export function outputTransactionValuesMatch(
  expectedActive: TRawOutputValues,
  activeFormData: IOutputFormGroupLike[],
  expectedTargetPreset: string | null,
  actualTargetPreset: string | null,
): boolean {
  return (
    rawOutputValuesMatch(expectedActive, activeFormData) &&
    expectedTargetPreset === actualTargetPreset
  );
}
