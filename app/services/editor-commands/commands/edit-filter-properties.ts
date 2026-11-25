import { CombinableCommand } from './combinable-command';
import { TObsFormData } from 'services/sources/obs-properties';
import { SourceFiltersService } from 'services/source-filters';
import { Inject } from 'services/core/injector';
import { $t } from 'services/i18n';

export class EditFilterPropertiesCommand extends CombinableCommand {
  @Inject() private sourceFiltersService: SourceFiltersService;

  beforeFormData: TObsFormData;
  afterFormData: TObsFormData;

  description: string;

  constructor(
    private sourceId: string,
    private filterName: string,
    private formData: TObsFormData,
  ) {
    super();

    this.description = $t('Edit %{filterName}', { filterName: this.filterName });
  }

  execute() {
    this.beforeFormData = this.sourceFiltersService.getPropertiesFormData(
      this.sourceId,
      this.filterName,
    );

    this.sourceFiltersService.setPropertiesFormData(
      this.sourceId,
      this.filterName,
      this.afterFormData || this.formData,
    );

    this.afterFormData = this.sourceFiltersService.getPropertiesFormData(
      this.sourceId,
      this.filterName,
    );
  }

  rollback() {
    this.sourceFiltersService.setPropertiesFormData(
      this.sourceId,
      this.filterName,
      this.beforeFormData,
    );
  }

  shouldCombine(other: EditFilterPropertiesCommand) {
    return this.sourceId === other.sourceId && this.filterName === other.filterName;
  }

  combine(other: EditFilterPropertiesCommand) {
    this.afterFormData = other.afterFormData;
  }
}
