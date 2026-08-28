import { IAutoOptimizerProfile } from 'services/auto-config/types';

/** Select only a Desktop-owned output recommendation for a live display context. */
export function autoOptimizerStandardLegForDisplay(
  profile: IAutoOptimizerProfile | null | undefined,
  display: 'horizontal' | 'vertical',
) {
  if (!profile || profile.schemaVersion !== 1 || profile.topology === 'enhanced-broadcasting') {
    return undefined;
  }
  return profile.legs.find(
    leg =>
      leg.outputKind === 'standard' &&
      leg.display !== 'both' &&
      leg.display === display,
  );
}
