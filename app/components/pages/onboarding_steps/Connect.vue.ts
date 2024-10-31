import { Inject } from 'services/core/injector';
import { OnboardingService } from 'services/onboarding';
import { TPlatform } from 'services/platforms';
import { UserService } from 'services/user';
import Vue from 'vue';
import { Component } from 'vue-property-decorator';
import NAirLogo from '../../../../media/images/n-air-logo.svg';

@Component({
  components: {
    NAirLogo,
  },
})
export default class Connect extends Vue {
  @Inject() userService: UserService;
  @Inject() onboardingService: OnboardingService;

  loadingState = false;

  authPlatform(platform: TPlatform) {
    this.loadingState = true;
    this.userService.startAuth({
      platform,
      onAuthClose: () => {
        this.loadingState = false;
      },
      onAuthFinish: () => {
        this.onboardingService.next();
      },
    });
  }

  iconForPlatform(platform: TPlatform) {
    if (this.loadingState) return 'icon-spinner icon-spin';

    return {
      niconico: 'icon-niconico',
    }[platform];
  }

  skipOnboarding() {
    this.onboardingService.skip();
  }

  get isSecurityUpgrade() {
    return this.onboardingService.options.isSecurityUpgrade;
  }
}
