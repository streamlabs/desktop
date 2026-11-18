import { $t } from 'services/i18n';
import type { ICategoryListCategory } from 'components-react/shared/inputs';
import {
  Conditions,
  GAME_NAMES,
  STREAM_EVENT_SOURCES,
  isStreamEventKey,
} from 'services/stream-avatar/engine/conditions';
import type { ConditionType } from 'services/stream-avatar/engine/conditions';
import { ActionRegistry } from 'services/stream-avatar/engine/actions';
import type { ActionType } from 'services/stream-avatar/engine/actions';
import type { TAutomationExport } from 'services/stream-avatar/engine/automations';
import type {
  AutomationTemplateItem,
  AutomationTemplatePack,
} from 'services/stream-avatar/stream-avatar-api-service';

export const BADGE_COLORS = ['#7c5cff', '#f97316', '#22c55e', '#ef4444', '#06b6d4', '#eab308'];

export function badgeColor(name: string): string {
  const hash = name.split('').reduce((h, c) => h + c.charCodeAt(0), 0);
  return BADGE_COLORS[hash % BADGE_COLORS.length];
}

export const VIDEO_EXTENSIONS = ['.webm', '.mp4', '.mov'];

export function isVideoUrl(url?: string): boolean {
  return !!url && VIDEO_EXTENSIONS.some(ext => url.toLowerCase().endsWith(ext));
}

const GAME_OPTIONS = Object.entries(GAME_NAMES)
  .map(([id, name]) => ({ label: name, value: id }))
  .sort((a, b) => a.label.localeCompare(b.label));

const STREAM_EVENT_OPTIONS = Object.entries(STREAM_EVENT_SOURCES).map(([value, label]) => ({
  label,
  value,
}));

/** Stream-event and game sources, as the categories of the trigger source pickers. */
export function triggerSourceCategories(): ICategoryListCategory<string>[] {
  return [
    { key: 'stream', label: $t('Stream Events'), options: STREAM_EVENT_OPTIONS },
    { key: 'games', label: $t('Games'), options: GAME_OPTIONS },
  ];
}

export function conditionLabel(condition: { type: string } | null): string {
  if (!condition?.type) return $t('(unknown)');
  const def = Conditions()[condition.type as ConditionType];
  return def ? def.label : condition.type;
}

export function conditionGame(condition: { type: string } | null): string {
  if (!condition?.type) return '';
  const def = Conditions()[condition.type as ConditionType];
  if (!def) return '';
  return GAME_NAMES[def.group] ?? STREAM_EVENT_SOURCES[def.group] ?? def.group;
}

export function summarizeActions(actions: TAutomationExport['actions']): string {
  const registry = ActionRegistry();
  return actions
    .filter(a => a?.type)
    .map(a => {
      const def = registry[a.type as ActionType];
      return def ? def.label : a.type;
    })
    .join(', ');
}

// ── Template packs ────────────────────────────────────

/** Most triggers one automation can hold (the API caps conditions at 5). */
export const MAX_AUTOMATION_CONDITIONS = 5;

// The linked platform a stream-event condition needs, by condition-key prefix. Prefixes that are
// missing (streamlabs, charity, patreon, treatstream and every game) never depend on one.
const CONDITION_GROUP_PLATFORM: Record<string, string> = {
  twitch: 'twitch',
  youtube: 'youtube',
  kick: 'kick',
  facebook: 'facebook',
  tiktok: 'tiktok',
  x: 'twitter',
};

/**
 * Event templates list their condition for every platform. Keeps the ones usable with the
 * platforms the user has linked and drops duplicates. The result can exceed what one
 * automation holds; split it with `chunkConditions`.
 */
export function resolveConditionsForPlatforms<T extends { type: string; props?: unknown }>(
  conditions: T[],
  linkedPlatforms: readonly string[],
): T[] {
  const seen = new Set<string>();
  const resolved: T[] = [];
  for (const condition of conditions) {
    const platform = CONDITION_GROUP_PLATFORM[condition.type.split('.')[0]];
    if (platform && !linkedPlatforms.includes(platform)) continue;

    const key = JSON.stringify([condition.type, condition.props ?? null]);
    if (seen.has(key)) continue;
    seen.add(key);
    resolved.push(condition);
  }
  return resolved;
}

/**
 * Splits conditions into groups one automation can hold. A follow template with all six
 * platforms linked becomes two automations instead of silently losing a platform.
 */
export function chunkConditions<T>(conditions: T[], max = MAX_AUTOMATION_CONDITIONS): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < conditions.length; i += max) chunks.push(conditions.slice(i, i + max));
  return chunks;
}

/** The conditions a template is created with for this user. Empty means it can't be used. */
export function resolveTemplateConditions(
  item: AutomationTemplateItem,
  linkedPlatforms: readonly string[],
) {
  return resolveConditionsForPlatforms(item.automation.conditions, linkedPlatforms);
}

/** Indices of the pack's templates that can be used with the user's linked platforms. */
export function availableTemplateIndices(
  pack: AutomationTemplatePack,
  linkedPlatforms: readonly string[],
): number[] {
  const indices: number[] = [];
  pack.templates.forEach((item, i) => {
    if (resolveTemplateConditions(item, linkedPlatforms).length > 0) indices.push(i);
  });
  return indices;
}

/** What a template is called on a pack card chip. */
export function templateChipLabel(item: AutomationTemplateItem): string {
  return item.chipLabel || item.title;
}

export type TemplateTriggerFilter = 'all' | 'game' | 'stream';
export type TemplateSort = 'default' | 'name' | 'events';

export interface ITemplatePackFilters {
  /** Game id (the pack's `game`), or '' for every game. */
  game: string;
  trigger: TemplateTriggerFilter;
  search: string;
  sort: TemplateSort;
}

export const DEFAULT_PACK_FILTERS: ITemplatePackFilters = {
  game: '',
  trigger: 'all',
  search: '',
  sort: 'default',
};

/** The games that have a pack, for the game filter. */
export function gameFilterOptions(
  packs: AutomationTemplatePack[],
): { label: string; value: string }[] {
  const options: { label: string; value: string }[] = [];
  for (const pack of packs) {
    if (pack.category === 'game' && pack.game) {
      options.push({ label: pack.name, value: pack.game });
    }
  }
  return options.sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Applies the picker's filters, then its sort. Choosing a game drops every event pack, and the
 * trigger filter keeps packs with at least one stream-event (or game-event) condition.
 */
export function filterAndSortPacks(
  packs: AutomationTemplatePack[],
  filters: ITemplatePackFilters,
): AutomationTemplatePack[] {
  const query = filters.search.trim().toLowerCase();

  const matches = packs.filter(pack => {
    if (filters.game && (pack.category !== 'game' || pack.game !== filters.game)) return false;

    if (filters.trigger !== 'all') {
      const wantStream = filters.trigger === 'stream';
      const hasTrigger = pack.templates.some(item =>
        item.automation.conditions.some(c => isStreamEventKey(c.type) === wantStream),
      );
      if (!hasTrigger) return false;
    }

    if (query) {
      const searchable = [
        pack.name,
        ...pack.templates.map(item => item.title),
        ...pack.templates.map(item => item.chipLabel ?? ''),
      ];
      if (!searchable.some(text => text.toLowerCase().includes(query))) return false;
    }

    return true;
  });

  if (filters.sort === 'default') return matches;

  // Keep the original order among ties, whatever the engine's sort stability.
  return matches
    .map((pack, index) => ({ pack, index }))
    .sort((a, b) => {
      const byField =
        filters.sort === 'name'
          ? a.pack.name.localeCompare(b.pack.name)
          : b.pack.templates.length - a.pack.templates.length;
      return byField || a.index - b.index;
    })
    .map(entry => entry.pack);
}
