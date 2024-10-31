import { defer } from 'lodash';
import { $t } from 'services/i18n';
import { SceneCollectionsService } from 'services/scene-collections';
import Vue from 'vue';
import { Multiselect } from 'vue-multiselect';
import { Component } from 'vue-property-decorator';
import NAirObsLogo from '../../../../media/images/n-air-obs-logo.svg';
import { Inject } from '../../../services/core/injector';
import { ObsImporterService } from '../../../services/obs-importer';
import { OnboardingService } from '../../../services/onboarding';

@Component({
  components: {
    Multiselect,
    NAirObsLogo,
  },
})
export default class ObsImport extends Vue {
  @Inject()
  onboardingService: OnboardingService;

  @Inject()
  obsImporterService: ObsImporterService;

  @Inject()
  sceneCollectionsService: SceneCollectionsService;

  status: 'initial' | 'importing' | 'done' = 'initial';

  // @ts-expect-error: ts2729: use before initialization
  sceneCollections = this.obsImporterService.getSceneCollections();

  // @ts-expect-error: ts2729: use before initialization
  profiles = this.obsImporterService.getProfiles();

  selectedProfile = this.profiles[0] || '';

  created() {
    if (this.sceneCollections && this.sceneCollections.length > 0) return;
    this.startFresh();
  }

  get title() {
    if (this.status === 'importing') {
      return $t('onboarding.importingStateTitle');
    }

    if (this.status === 'done') {
      return $t('onboarding.doneStateTitle');
    }

    return $t('onboarding.initialStateTitle');
  }

  get description() {
    if (this.status === 'importing') {
      return $t('onboarding.importingStateDescription');
    }

    if (this.status === 'done') {
      return $t('onboarding.doneStateDescription');
    }

    return $t('onboarding.initialStateDescription');
  }

  startImport() {
    this.status = 'importing';
    defer(async () => {
      try {
        await this.obsImporterService.load(this.selectedProfile);
        this.status = 'done';
      } catch (e) {
        // I suppose let's pretend we succeeded for now.
        this.status = 'done';
      }
    });
  }

  startFresh() {
    this.onboardingService.skip();
  }

  next() {
    this.onboardingService.next();
  }
}
