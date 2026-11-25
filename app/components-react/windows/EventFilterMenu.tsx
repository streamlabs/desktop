import React from 'react';
import { Button } from 'antd';
import { $t } from 'services/i18n';
import { Services } from '../service-provider';
import { useVuex } from '../hooks';
import { ModalLayout } from '../shared/ModalLayout';
import { CheckboxInput, NumberInput } from '../shared/inputs';
import Form from '../shared/inputs/Form';
import styles from './EventFilterMenu.m.less';

interface IFilter {
  name: string;
  value: boolean | number;
}

export default function EventFilterMenu() {
  const { RecentEventsService, UserService, WindowsService } = Services;

  const { filters, isTwitch } = useVuex(() => ({
    filters: RecentEventsService.filters,
    isTwitch: UserService.views.platform?.type === 'twitch',
  }));

  const mainFilters = filters.main as Record<string, IFilter>;
  const subFilters = filters.sub as Record<string, IFilter>;
  const resubFilters = filters.resub as Record<string, IFilter>;
  const minMonthsFilters = filters.minMonths as Record<string, IFilter>;

  const subsEnabled = !!subFilters.subscription?.value;
  const resubsEnabled = !!resubFilters.resub?.value;

  function updateFilter(key: string, value: boolean | number) {
    RecentEventsService.actions.updateFilterPreference(key, value);
  }

  function renderBooleanInput(key: string, filter: IFilter | undefined, header = false) {
    if (!filter) return null;
    return (
      <CheckboxInput
        name={key}
        value={!!filter.value}
        label={$t(filter.name)}
        onChange={(value: boolean) => updateFilter(key, value)}
        className={header ? styles.categoryHeader : undefined}
      />
    );
  }

  function renderSubFilters() {
    return (
      <div className={styles.halfWidth}>
        <div>{renderBooleanInput('subscription', subFilters.subscription, true)}</div>
        {subsEnabled &&
          Object.entries(subFilters)
            .filter(([name]) => name !== 'subscription')
            .map(([name, filter]) => <div key={name}>{renderBooleanInput(name, filter)}</div>)}
      </div>
    );
  }

  function renderResubMonthsFilter() {
    if (!isTwitch) return null;
    const minEnabledFilter = resubFilters.filter_subscription_minimum_enabled;
    const minMonthsFilter = minMonthsFilters.filter_subscription_minimum_months;
    return (
      <div className={styles.minimum}>
        {resubsEnabled &&
          renderBooleanInput('filter_subscription_minimum_enabled', minEnabledFilter)}
        {resubsEnabled && minEnabledFilter?.value && minMonthsFilter && (
          <div className={styles.monthsInputContainer}>
            <div className={styles.monthsInput} data-testid="min-months">
              <NumberInput
                name="filter_subscription_minimum_months"
                value={minMonthsFilter.value as number}
                min={1}
                max={120}
                onChange={(value: number) =>
                  updateFilter('filter_subscription_minimum_months', Math.round(value))
                }
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderResubFilters() {
    return (
      <div className={styles.halfWidth}>
        <div>{renderBooleanInput('resub', resubFilters.resub, true)}</div>
        <div className={styles.resubOptions}>
          {resubsEnabled &&
            Object.entries(resubFilters)
              .filter(
                ([name]) =>
                  !/months/.test(name) &&
                  name !== 'resub' &&
                  name !== 'filter_subscription_minimum_enabled',
              )
              .map(([name, filter]) => <div key={name}>{renderBooleanInput(name, filter)}</div>)}
        </div>
        {renderResubMonthsFilter()}
      </div>
    );
  }

  return (
    <ModalLayout
      footer={
        <Button type="primary" onClick={() => WindowsService.actions.closeChildWindow()}>
          {$t('Done')}
        </Button>
      }
    >
      <Form layout="inline">
        <div className={styles.flexColumn} style={{ width: '100%' }}>
          <div className={styles.generalFilters}>
            {Object.entries(mainFilters).map(([name, filter]) => (
              <div key={name}>{renderBooleanInput(name, filter)}</div>
            ))}
          </div>
          {isTwitch && (
            <div className={styles.subFilters}>
              {renderSubFilters()}
              {renderResubFilters()}
            </div>
          )}
        </div>
      </Form>
    </ModalLayout>
  );
}
