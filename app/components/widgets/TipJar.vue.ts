import { Component } from 'vue-property-decorator';
import { Inject } from '../../services/core/injector';
import WidgetEditor from 'components/windows/WidgetEditor.vue';
import WidgetSettings from './WidgetSettings.vue';
import { TipJarService, ITipJarData } from 'services/widgets/settings/tip-jar';
import { UserService } from 'services/user';
import { HostsService } from 'services/hosts';
import { inputComponents } from 'components/shared/inputs';
import VFormGroup from 'components/shared/inputs/VFormGroup.vue';

import { $t } from 'services/i18n';
import ValidatedForm from 'components/shared/inputs/ValidatedForm';
import ImagePickerInput from 'components/shared/inputs/ImagePickerInput.vue';

const nameMap = () => ({
  tips: $t('Tips & Donations'),
  twitch_follows: $t('Twitch Follows'),
  twitch_bits: $t('Twitch Bits'),
  twitch_subs: $t('Twitch Subs'),
  twitch_resubs: $t('Twitch Resubs'),
  youtube_subscribers: $t('YouTube Subscriptions'),
  youtube_sponsors: $t('YouTube Memberships'),
  youtube_superchats: $t('YouTube Super Chats'),
  periscope_superhearts: $t('Periscope Super Hearts'),
  picarto_follows: $t('Picarto Follows'),
  picarto_subscriptions: $t('Picarto Subscriptions'),
  facebook_follows: $t('Facebook Follows'),
  facebook_likes: $t('Facebook Likes'),
  facebook_shares: $t('Facebook Shares'),
  facebook_stars: $t('Facebook Stars'),
  facebook_supports: $t('Facebook Supports'),
  facebook_support_gifters: $t('Facebook Support Gifters'),
  trovo_follows: $t('Trovo Follows'),
  trovo_resubs: $t('Trovo Resubs'),
  trovo_subscriptions: $t('Trovo Subs'),
});

const mediaGalleryInputs = {
  twitch: ['twitch_follows'],
  youtube: ['youtube_subscribers', 'youtube_sponsors'],
};

@Component({
  components: {
    WidgetEditor,
    VFormGroup,
    ValidatedForm,
    ImagePickerInput,
    ...inputComponents,
  },
})
export default class TipJar extends WidgetSettings<ITipJarData, TipJarService> {
  @Inject() userService: UserService;
  @Inject() hostsService!: HostsService;

  textColorTooltip = $t('A hex code for the base text color.');

  backgroundColorDescription = $t(
    'Note: This background color is for preview purposes only. It will not be shown in your stream.',
  );

  jarSrc = `https://${this.hostsService.cdn}/static/tip-jar/jars/glass-`;
  inputOptions: { description: string; value: string }[] = [];
  get navItems() {
    return [
      { value: 'manage-jar', label: $t('Manage Jar') },
      { value: 'font', label: $t('Font Settings') },
      { value: 'images', label: $t('Images') },
      { value: 'source', label: $t('Source') },
    ];
  }

  titleFromKey(key: string) {
    return nameMap()[key];
  }

  get iterableTypes() {
    return Object.keys(this.wData.settings.types).filter(
      key => key !== '_id' && key !== 'priority',
    );
  }

  get platform() {
    return this.userService.platform.type;
  }

  get mediaGalleryInputs() {
    if (!mediaGalleryInputs[this.platform]) return [];
    return mediaGalleryInputs[this.platform];
  }

  afterFetch() {
    this.inputOptions = this.wData.jars.map((jar: string) => ({
      description: `${this.jarSrc}${jar}.png`,
      value: jar,
    }));
  }
}
