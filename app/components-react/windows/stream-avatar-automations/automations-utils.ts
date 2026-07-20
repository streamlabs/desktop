import { $t } from 'services/i18n';
import { Conditions, GAME_NAMES } from 'services/stream-avatar/engine/conditions';
import { ActionRegistry } from 'services/stream-avatar/engine/actions';
import type { TAutomationExport } from 'services/stream-avatar/engine/automations';

export const BADGE_COLORS = ['#7c5cff', '#f97316', '#22c55e', '#ef4444', '#06b6d4', '#eab308'];

export function badgeColor(name: string): string {
  const hash = name.split('').reduce((h, c) => h + c.charCodeAt(0), 0);
  return BADGE_COLORS[hash % BADGE_COLORS.length];
}

export const VIDEO_EXTENSIONS = ['.webm', '.mp4', '.mov'];

export function isVideoUrl(url?: string): boolean {
  return !!url && VIDEO_EXTENSIONS.some(ext => url.toLowerCase().endsWith(ext));
}

export const GAME_OPTIONS = Object.entries(GAME_NAMES)
  .map(([id, name]) => ({ label: name, value: id }))
  .sort((a, b) => a.label.localeCompare(b.label));

export function conditionLabel(condition: { type: string } | null): string {
  if (!condition?.type) return $t('(unknown)');
  const def = Conditions[condition.type as keyof typeof Conditions];
  return def ? def.label : condition.type;
}

export function conditionGame(condition: { type: string } | null): string {
  if (!condition?.type) return '';
  const def = Conditions[condition.type as keyof typeof Conditions];
  if (!def) return '';
  return GAME_NAMES[def.group] ?? def.group;
}

export function summarizeActions(actions: TAutomationExport['actions']): string {
  return actions
    .filter(a => a?.type)
    .map(a => {
      const def = ActionRegistry[a.type as keyof typeof ActionRegistry];
      return def ? def.label : a.type;
    })
    .join(', ');
}
