import { Component } from 'vue-property-decorator';
import { UserService } from '../../services/user';
import { Inject } from 'services/core/injector';
import ModalLayout from 'components/ModalLayout.vue';
import TsxComponent from 'components/tsx-component';
import { $t } from 'services/i18n';
import { WindowsService } from 'services/windows';
import { RecentEventsService } from 'services/recent-events';
import { BoolInput, NumberInput } from 'components/shared/inputs/inputs';
import styles from './EventFilterMenu.m.less';

@Component({})
export default class EventFilterMenu extends TsxComponent<{}> {
  @Inject() windowsService: WindowsService;
  @Inject() recentEventsService: RecentEventsService;
  @Inject() userService: UserService;

  cancel() {
    this.windowsService.closeChildWindow();
  }

  get mainFilters() {
    return this.recentEventsService.filters.main;
  }

  get subFilters() {
    return this.recentEventsService.filters.sub;
  }

  get resubFilters() {
    return this.recentEventsService.filters.resub;
  }

  get minMonthsFilter() {
    return this.recentEventsService.filters.minMonths;
  }

  get subsEnabled() {
    return this.subFilters.hasOwnProperty('subscription') && this.subFilters['subscription'].value;
  }

  get resubsEnabled() {
    return this.resubFilters.hasOwnProperty('resub') && this.resubFilters['resub'].value;
  }

  get isTwitch() {
    return this.userService.platform.type === 'twitch';
  }

  get isTrovo() {
    return this.userService.platform.type === 'trovo';
  }

  updateFilter(filter: string, value: boolean | number) {
    this.recentEventsService.updateFilterPreference(filter, value);
  }

  renderBooleanInput(
    key: string,
    filter: { name: string; value: boolean },
    header: boolean = false,
  ) {
    return (
      <BoolInput
        value={filter.value}
        metadata={{ title: $t(filter.name) }}
        onInput={(value: boolean) => this.updateFilter(key, value)}
        class={header ? styles.categoryHeader : ''}
      />
    );
  }

  get renderGeneralFilters() {
    return (
      <div class={styles.generalFilters}>
        {Object.entries(this.mainFilters).map(([name, filter]) => (
          <div>{this.renderBooleanInput(name, filter)}</div>
        ))}
      </div>
    );
  }

  get renderSubFilters() {
    return (
      <div class={styles.halfWidth}>
        <div>{this.renderBooleanInput('subscription', this.subFilters['subscription'], true)}</div>
        {this.subsEnabled &&
          Object.entries(this.subFilters)
            .filter(([name]) => name !== 'subscription')
            .map(([name, filter]) => <div>{this.renderBooleanInput(name, filter)}</div>)}
      </div>
    );
  }

  get renderResubFilters() {
    return (
      <div class={styles.halfWidth}>
        <div>{this.renderBooleanInput('resub', this.resubFilters['resub'], true)}</div>
        <div class={styles.resubOptions}>
          {this.resubsEnabled &&
            Object.entries(this.resubFilters)
              .filter(
                ([name]) =>
                  !/months/.test(name) &&
                  name !== 'resub' &&
                  name !== 'filter_subscription_minimum_enabled',
              )
              .map(([name, filter]) => <div>{this.renderBooleanInput(name, filter)}</div>)}
        </div>
        {this.renderResubMonthsFilter}
      </div>
    );
  }

  get renderResubMonthsFilter() {
    if (!this.isTwitch) {
      return;
    }
    const minEnabledFilter = this.resubFilters['filter_subscription_minimum_enabled'];
    const minMonthsFilter = this.minMonthsFilter['filter_subscription_minimum_months'];
    return (
      <div class={styles.minimum}>
        {this.resubsEnabled &&
          this.renderBooleanInput('filter_subscription_minimum_enabled', minEnabledFilter)}
        {this.resubsEnabled && minEnabledFilter?.value && (
          <div class={styles.monthsInputContainer}>
            <NumberInput
              value={minMonthsFilter.value}
              metadata={{ min: 1, max: 120, isInteger: true }}
              onInput={(value: number) =>
                this.updateFilter('filter_subscription_minimum_months', value)
              }
              class={styles.monthsInput}
            />
          </div>
        )}
      </div>
    );
  }

  render() {
    return (
      <ModalLayout customControls showControls={false}>
        <div slot="content" class={styles.flexColumn}>
          {this.renderGeneralFilters}
          {(this.isTwitch || this.isTrovo) && (
            <div class={styles.subFilters}>
              {this.renderSubFilters}
              {this.renderResubFilters}
            </div>
          )}
        </div>
        <div slot="controls">
          <button class="button button--action" onClick={this.cancel}>
            {$t('Done')}
          </button>
        </div>
      </ModalLayout>
    );
  }
}
