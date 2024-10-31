import Vue from 'vue';
import { Component } from 'vue-property-decorator';
import { Inject } from '../../services/core/injector';
import { SourceFiltersService } from '../../services/source-filters';
import { WindowsService } from '../../services/windows';

import * as inputComponents from 'components/obs/inputs';
import { $t } from 'services/i18n';
import ModalLayout from '../ModalLayout.vue';

@Component({
  components: { ModalLayout, ...inputComponents },
})
export default class AddSourceFilter extends Vue {
  @Inject()
  windowsService: WindowsService;

  @Inject('SourceFiltersService')
  filtersService: SourceFiltersService;

  // @ts-expect-error: ts2729: use before initialization
  sourceId: string = this.windowsService.getChildWindowQueryParams().sourceId;
  // @ts-expect-error: ts2729: use before initialization
  form = this.filtersService.getAddNewFormData(this.sourceId);
  // @ts-expect-error: ts2729: use before initialization
  availableTypes = this.filtersService.getTypesForSource(this.sourceId);
  error = '';

  mounted() {
    this.setTypeAsName();
  }

  done() {
    const name = this.form.name.value;
    this.error = this.validateName(name);
    if (this.error) return;

    this.filtersService.add(this.sourceId, this.form.type.value, name);

    this.filtersService.showSourceFilters(this.sourceId, name);
  }

  cancel() {
    this.filtersService.showSourceFilters(this.sourceId);
  }

  validateName(name: string) {
    if (!name) return $t('common.nameIsRequiredMessage');
    if (this.filtersService.getFilters(this.sourceId).find(filter => filter.name === name)) {
      return $t('common.alreadyTakenNameMessage');
    }
    return '';
  }

  setTypeAsName() {
    const name = this.availableTypes.find(({ type }) => {
      return type === this.form.type.value;
    }).description;
    this.form.name.value = this.filtersService.suggestName(this.sourceId, name);
  }
}
