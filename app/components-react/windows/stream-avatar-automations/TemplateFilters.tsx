import React, { useMemo } from 'react';
import { Input, Select } from 'antd';
import { $t } from 'services/i18n';
import type {
  ITemplatePackFilters,
  TemplateSort,
  TemplateTriggerFilter,
} from './automations-utils';
import styles from './AutomationTemplates.m.less';

interface Props {
  filters: ITemplatePackFilters;
  /** The games that have a pack. */
  games: { label: string; value: string }[];
  onChange: (filters: ITemplatePackFilters) => void;
}

export default function TemplateFilters({ filters, games, onChange }: Props) {
  const gameOptions = useMemo(() => [{ label: $t('All Games'), value: '' }, ...games], [games]);

  const triggerOptions: { label: string; value: TemplateTriggerFilter }[] = [
    { label: $t('All Triggers'), value: 'all' },
    { label: $t('Game Events'), value: 'game' },
    { label: $t('Stream Events'), value: 'stream' },
  ];

  const sortOptions: { label: string; value: TemplateSort }[] = [
    { label: $t('Default'), value: 'default' },
    { label: $t('Name A–Z'), value: 'name' },
    { label: $t('Most events'), value: 'events' },
  ];

  return (
    <div className={styles.filters}>
      <Select
        className={styles.filterSelect}
        value={filters.game}
        options={gameOptions}
        onChange={game => onChange({ ...filters, game })}
        showSearch
        optionFilterProp="label"
        // The field is narrower than the longest game names.
        dropdownMatchSelectWidth={260}
      />
      <Select
        className={styles.filterSelect}
        value={filters.trigger}
        options={triggerOptions}
        onChange={trigger => onChange({ ...filters, trigger })}
      />
      <Input
        className={styles.filterSearch}
        value={filters.search}
        placeholder={$t('Search Automations')}
        onChange={e => onChange({ ...filters, search: e.target.value })}
        allowClear
      />
      <Select
        className={styles.filterSort}
        // Undefined shows the placeholder while the sort is the default.
        value={filters.sort === 'default' ? undefined : filters.sort}
        placeholder={$t('Sort By')}
        options={sortOptions}
        onChange={sort => onChange({ ...filters, sort: sort ?? 'default' })}
      />
    </div>
  );
}
