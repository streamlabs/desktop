import { Component } from 'vue-property-decorator';
import { CreditsService, ICreditsData } from 'services/widgets/settings/credits';
import { inputComponents } from 'components/widgets/inputs';
import WidgetEditor from 'components/windows/WidgetEditor.vue';
import WidgetSettings from './WidgetSettings.vue';
import VFormGroup from 'components/shared/inputs/VFormGroup.vue';
import { $t } from 'services/i18n/index';
import ValidatedForm from 'components/shared/inputs/ValidatedForm';

@Component({
  components: {
    WidgetEditor,
    VFormGroup,
    ValidatedForm,
    ...inputComponents,
  },
})
export default class Credits extends WidgetSettings<ICreditsData, CreditsService> {
  get themeOptions() {
    return Object.keys(this.wData.themes).map(theme => ({
      title: this.wData.themes[theme].label,
      value: theme,
    }));
  }

  optionIterable(map: Dictionary<string>) {
    // TODO: index
    // @ts-ignore
    return Object.keys(map).filter(option => this.wData.settings[option] != null);
  }

  get shownCreditOptions() {
    return {
      // Twitch
      followers: $t('Show Followers'),
      subscribers: $t('Show Subscribers'),
      bits: $t('Show Cheers'),
      moderators: $t('Show Moderators'),
      // Youtube
      subscriptions: $t('Show Subscriptions'),
      sponsors: $t('Show Members'),
      superchats: $t('Show Super Chats'),
    };
  }

  get creditNameOptions() {
    return {
      // Twitch
      followers_change: $t('Followers'),
      subscribers_change: $t('Subscribers & Resubs'),
      bits_change: $t('Cheers'),
      mods_change: $t('Moderators'),
      // Youtube
      subscriptions_change: $t('Subscriptions'),
      sponsors_change: $t('Members'),
      superchats_change: $t('Super Chats'),
    };
  }

  rollCredits() {
    this.service.testRollCredits();
  }

  get metadata() {
    return this.service.getMetadata(this.themeOptions);
  }

  get navItems() {
    return [
      { value: 'manage-credits', label: $t('Manage Credits') },
      { value: 'visual', label: $t('Visual Settings') },
      { value: 'source', label: $t('Source') },
    ];
  }
}
