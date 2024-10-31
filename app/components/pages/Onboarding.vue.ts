import Vue from 'vue';
import { Component } from 'vue-property-decorator';
import { Inject } from '../../services/core/injector';
import { OnboardingService } from '../../services/onboarding';
import Connect from './onboarding_steps/Connect.vue';
import ObsImport from './onboarding_steps/ObsImport.vue';
import SuccessfullyImported from './onboarding_steps/SuccessfullyImported.vue';

@Component({
  components: {
    Connect,
    ObsImport,
    SuccessfullyImported,
  },
})
export default class Onboarding extends Vue {
  @Inject()
  onboardingService: OnboardingService;

  get currentView() {
    return this.onboardingService.currentStep;
  }
}
