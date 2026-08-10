export interface IOutputFormParameterLike {
  name: string;
  value?: unknown;
}

export interface IOutputFormGroupLike {
  nameSubCategory: string;
  parameters: IOutputFormParameterLike[];
}

export type TRawOutputValues = Record<string, unknown>;

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
