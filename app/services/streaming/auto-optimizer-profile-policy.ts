import { IAutoOptimizerProfile } from 'services/auto-config/types';

/** Select only a Desktop-owned output recommendation for a live display context. */
export function autoOptimizerStandardOutputForDisplay(
  profile: IAutoOptimizerProfile | null | undefined,
  display: 'horizontal' | 'vertical',
) {
  if (!profile || profile.schemaVersion !== 1 || profile.streamSetup === 'enhanced-broadcasting') {
    return undefined;
  }
  return profile.outputs.find(
    output =>
      output.outputKind === 'standard' && output.display !== 'both' && output.display === display,
  );
}
