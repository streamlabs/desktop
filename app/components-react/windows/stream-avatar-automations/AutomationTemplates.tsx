import React, { useEffect, useMemo, useState } from 'react';
import { message, Spin } from 'antd';
import { ModalLayout } from 'components-react/shared/ModalLayout';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import { $t } from 'services/i18n';
import type { AutomationTemplatePack } from 'services/stream-avatar/stream-avatar-api-service';
import AutomationTemplatesFooter from './AutomationTemplatesFooter';
import TemplateFilters from './TemplateFilters';
import TemplatePackCard from './TemplatePackCard';
import TemplatePackDetail from './TemplatePackDetail';
import TemplatePackRow from './TemplatePackRow';
import UsageMeter from './UsageMeter';
import { enabledUsage } from './automations-limits';
import {
  DEFAULT_PACK_FILTERS,
  availableTemplateIndices,
  chunkConditions,
  filterAndSortPacks,
  gameFilterOptions,
  resolveTemplateConditions,
} from './automations-utils';
import type { ITemplatePackFilters } from './automations-utils';
import { applyTemplates } from './template-applicator';
import styles from './AutomationTemplates.m.less';

interface Props {
  onCancel: () => void;
  onSaved?: () => void;
  variant: 'welcome' | 'templatePicker';
}

type View = 'browse' | { packId: string };

export default function AutomationTemplates({ onCancel, onSaved, variant }: Props) {
  const { StreamAvatarApiService, UserService } = Services;
  const [packs, setPacks] = useState<AutomationTemplatePack[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('browse');
  const [filters, setFilters] = useState<ITemplatePackFilters>(DEFAULT_PACK_FILTERS);
  const [selections, setSelections] = useState<Record<string, Set<number>>>({});
  const [saving, setSaving] = useState(false);

  const usage = useVuex(() => enabledUsage());
  const linkedPlatforms = useVuex(() => UserService.views.linkedPlatforms);

  useEffect(() => {
    let cancelled = false;
    StreamAvatarApiService.actions.return
      .getAutomationTemplatePacks()
      .then(loaded => {
        if (!cancelled) setPacks(loaded);
      })
      .catch(e => console.error('[AutomationTemplates] Failed to load template packs', e))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Event templates only work on platforms the user has linked, so work out per pack which
  // templates can be added.
  const availableByPack = useMemo(() => {
    const available: Record<string, number[]> = {};
    for (const pack of packs) available[pack.id] = availableTemplateIndices(pack, linkedPlatforms);
    return available;
  }, [packs, linkedPlatforms]);

  const gameOptions = useMemo(() => gameFilterOptions(packs), [packs]);
  const visiblePacks = useMemo(() => filterAndSortPacks(packs, filters), [packs, filters]);
  const gamePacks = visiblePacks.filter(pack => pack.category === 'game');
  const eventPacks = visiblePacks.filter(pack => pack.category === 'event');

  function availableOf(pack: AutomationTemplatePack): number[] {
    return availableByPack[pack.id] ?? [];
  }

  function selectedCount(pack: AutomationTemplatePack): number {
    const selected = selections[pack.id];
    return selected ? availableOf(pack).filter(i => selected.has(i)).length : 0;
  }

  function setPackSelection(packId: string, next: Set<number>) {
    setSelections(prev => ({ ...prev, [packId]: next }));
  }

  function togglePack(pack: AutomationTemplatePack) {
    const available = availableOf(pack);
    if (available.length === 0) return;
    const allSelected = selectedCount(pack) === available.length;
    setPackSelection(pack.id, allSelected ? new Set() : new Set(available));
  }

  function toggleTemplate(pack: AutomationTemplatePack, index: number) {
    const next = new Set(selections[pack.id]);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setPackSelection(pack.id, next);
  }

  const totalSelected = packs.reduce((sum, pack) => sum + selectedCount(pack), 0);
  // Counts automations, not templates: one over the condition cap becomes several.
  const automationsToCreate = packs.reduce((sum, pack) => {
    let count = 0;
    selections[pack.id]?.forEach(i => {
      const item = pack.templates[i];
      if (item) count += chunkConditions(resolveTemplateConditions(item, linkedPlatforms)).length;
    });
    return sum + count;
  }, 0);
  // The meter moves as packs are added, up to what the tier allows enabled. A count already
  // over the cap (e.g. after a downgrade) is shown as is.
  const projectedCount = Math.max(
    usage.count,
    Math.min(usage.max, usage.count + automationsToCreate),
  );

  async function handleComplete() {
    if (totalSelected === 0) {
      onCancel();
      return;
    }
    setSaving(true);
    try {
      await applyTemplates(selections, packs);
    } catch (e: unknown) {
      // Some automations may already exist, so close and refresh the list rather than let a
      // second Finish create duplicates.
      console.error('[AutomationTemplates] Failed to add templates', e);
      message.error($t('Some automations could not be added. Please try again.'));
    } finally {
      setSaving(false);
    }
    onSaved?.();
  }

  const detailPack = view === 'browse' ? undefined : packs.find(pack => pack.id === view.packId);

  const footer = (
    <AutomationTemplatesFooter
      totalSelected={totalSelected}
      saving={saving}
      onBack={detailPack ? () => setView('browse') : undefined}
      onCancel={onCancel}
      onComplete={handleComplete}
      cancelLabel={variant === 'welcome' ? $t('Skip') : undefined}
    />
  );

  function renderRow(title: string, rowPacks: AutomationTemplatePack[]) {
    if (rowPacks.length === 0) return null;
    return (
      <TemplatePackRow title={title}>
        {rowPacks.map(pack => (
          <TemplatePackCard
            key={pack.id}
            pack={pack}
            availableCount={availableOf(pack).length}
            selectedCount={selectedCount(pack)}
            onOpen={() => setView({ packId: pack.id })}
            onToggleAll={() => togglePack(pack)}
          />
        ))}
      </TemplatePackRow>
    );
  }

  function renderBody() {
    if (loading) return <Spin />;

    if (detailPack) {
      return (
        <TemplatePackDetail
          pack={detailPack}
          availableIndices={availableOf(detailPack)}
          selection={selections[detailPack.id] ?? new Set<number>()}
          onToggleTemplate={index => toggleTemplate(detailPack, index)}
          onToggleAll={() => togglePack(detailPack)}
        />
      );
    }

    return (
      <>
        <TemplateFilters filters={filters} games={gameOptions} onChange={setFilters} />
        {renderRow($t('Game Packs'), gamePacks)}
        {renderRow($t('Events Automations'), eventPacks)}
        {visiblePacks.length === 0 && (
          <div className={styles.empty}>
            {packs.length === 0
              ? $t('Unable to load templates. Please try again later.')
              : $t('No templates match the selected filters.')}
          </div>
        )}
      </>
    );
  }

  return (
    <ModalLayout footer={footer} scrollable>
      <div className={styles.container}>
        <div className={styles.header}>
          {variant === 'welcome' && (
            <p className={styles.subtitle}>
              {$t(
                'Automatically trigger stream effects in response to game events. Select from templates or skip to start from scratch.',
              )}
            </p>
          )}
          <UsageMeter count={projectedCount} max={usage.max} tier={usage.tier} label="enabled" />
        </div>
        {renderBody()}
      </div>
    </ModalLayout>
  );
}
