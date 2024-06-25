import Vue from 'vue';
import { Component } from 'vue-property-decorator';
import { Inject } from 'services/core/injector';
import { WindowsService } from 'services/windows';
import { ScenesService } from 'services/scenes';
import { ISourcesServiceApi, TSourceType, ISourceApi, ISourceAddOptions } from 'services/sources';
import ModalLayout from 'components/ModalLayout.vue';
import Selector from 'components/Selector.vue';
import Display from 'components/shared/Display.vue';
import { $t } from 'services/i18n';
import { NVoiceCharacterService, NVoiceCharacterType } from 'services/nvoice-character';

@Component({
  components: { ModalLayout, Selector, Display },
})
export default class AddSource extends Vue {
  @Inject() sourcesService: ISourcesServiceApi;
  @Inject() scenesService: ScenesService;
  @Inject() windowsService: WindowsService;
  @Inject() nVoiceCharacterService: NVoiceCharacterService;

  name = '';
  error = '';
  // @ts-expect-error: ts2729: use before initialization

  sourceType = this.windowsService.getChildWindowQueryParams().sourceType as TSourceType;
  // @ts-expect-error: ts2729: use before initialization
  sourceAddOptions = this.windowsService.getChildWindowQueryParams()
    .sourceAddOptions as ISourceAddOptions;

  canAddNew = true;
  adding = false;

  get nVoiceCharacterType(): NVoiceCharacterType {
    return this.sourceAddOptions.propertiesManagerSettings.nVoiceCharacterType || 'near';
  }

  // @ts-expect-error: ts2729: use before initialization
  sources = this.sourcesService.getSources().filter(source => {
    const comparison = {
      type: this.sourceType,
      propertiesManager: this.sourceAddOptions.propertiesManager,
    };
    return (
      source.isSameType(
        comparison.propertiesManager === 'nvoice-character'
          ? { ...comparison, nVoiceCharacterType: this.nVoiceCharacterType }
          : comparison,
      ) && source.sourceId !== this.scenesService.activeSceneId
    );
  });

  existingSources = this.sources.map(source => {
    return { name: source.name, value: source.sourceId };
  });

  selectedSourceId = this.sources[0] ? this.sources[0].sourceId : null;

  mounted() {
    if (this.sourceAddOptions.propertiesManager === 'custom-cast-ndi') {
      this.name = this.sourcesService.suggestName($t('source-props.custom_cast_ndi_source.name'));
    } else if (this.sourceAddOptions.propertiesManager === 'nvoice-character') {
      const type = this.sourceAddOptions.propertiesManagerSettings.nVoiceCharacterType || 'near';
      this.name = this.sourcesService.suggestName($t(`source-props.${type}.name`));
    } else {
      const sourceType =
        this.sourceType &&
        this.sourcesService
          .getAvailableSourcesTypesList()
          .find(sourceTypeDef => sourceTypeDef.value === this.sourceType);

      this.name = this.sourcesService.suggestName(this.sourceType && sourceType.description);
    }

    if (this.sourceType === 'scene') this.canAddNew = false;
    // ソースとしては1つだけ登録可能とする
    if (this.sources.length > 0 && this.sources[0].type === 'nair-rtvc-source')
      this.canAddNew = false;
  }

  addExisting() {
    const scene = this.scenesService.activeScene;
    if (!scene.canAddSource(this.selectedSourceId)) {
      // for now only a scene-source can be a problem
      alert($t('sources.circularReferenceMessage'));
      return;
    }
    this.adding = true;
    this.scenesService.activeScene.addSource(this.selectedSourceId);
    this.close();
  }

  close() {
    this.windowsService.closeChildWindow();
  }

  addNew() {
    if (!this.name) {
      this.error = $t('sources.sourceNameIsRequired');
    } else {
      let s: {
        source: ISourceApi;
        options: ISourceAddOptions;
      };

      if (this.sourceAddOptions.propertiesManager === 'nvoice-character') {
        const type: NVoiceCharacterType =
          this.sourceAddOptions.propertiesManagerSettings.nVoiceCharacterType || 'near';
        s = this.nVoiceCharacterService.createNVoiceCharacterSource(type, this.name);
      } else {
        s = {
          source: this.sourcesService.createSource(
            this.name,
            this.sourceType,
            {}, // IPCがundefinedをnullに変換するのでデフォルト値は使わない
            {
              propertiesManager: this.sourceAddOptions.propertiesManager,
              propertiesManagerSettings: this.sourceAddOptions.propertiesManagerSettings,
            },
          ),
          options: {},
        };
      }

      this.adding = true;
      this.scenesService.activeScene.addSource(s.source.sourceId, s.options);

      if (s.source.hasProps()) {
        this.sourcesService.showSourceProperties(s.source.sourceId);
      } else {
        this.close();
      }
    }
  }

  get selectedSource() {
    return this.sourcesService.getSource(this.selectedSourceId);
  }
}
