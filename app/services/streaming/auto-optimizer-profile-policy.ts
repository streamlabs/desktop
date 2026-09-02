import { IAutoOptimizerProfile } from 'services/auto-config/types';

/** Return the standard recommendation for this display; ignore Twitch-managed outputs. */
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
