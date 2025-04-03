import { Component } from 'vue-property-decorator';
import { SponsorBannerService, ISponsorBannerData } from 'services/widgets/settings/sponsor-banner';

import WidgetEditor from 'components/windows/WidgetEditor.vue';
import WidgetSettings from './WidgetSettings.vue';

import { inputComponents } from './inputs';
import VFormGroup from 'components/shared/inputs/VFormGroup.vue';

import { $t } from 'services/i18n';
import ValidatedForm from 'components/shared/inputs/ValidatedForm';

@Component({
  components: {
    WidgetEditor,
    VFormGroup,
    ValidatedForm,
    ...inputComponents,
  },
})
export default class SponsorBanner extends WidgetSettings<
  ISponsorBannerData,
  SponsorBannerService
> {
  placementOptions = [
    { title: $t('Single'), value: 'single' },
    { title: $t('Double'), value: 'double' },
  ];

  hideDurationTooltip = $t('Set to zero to show the widget permanently.');
  showDurationTooltip = $t('The amount of time the widget will appear.');
  animationTooltip = $t('These are the animations that are used to show your banner.');

  get positions() {
    if (!this.loaded) return ['1'];
    return this.wData.settings.placement_options === 'double' ? ['1', '2'] : ['1'];
  }

  get navItems() {
    const baseSettings = [
      { value: 'visual', label: $t('Visual Settings') },
      { value: 'source', label: $t('Source') },
    ];
    return baseSettings.concat(
      this.positions.map(pos => ({ value: `set-${pos}`, label: $t('Image Set ') + pos })),
    );
  }

  fileNameFromHref(href: string) {
    if (!href) return null;
    return decodeURIComponent(href.split(/[\\/]/).pop());
  }

  addImage(placement: string) {
    this.wData.settings[`placement_${placement}_images`].push({
      href: $t('No Image'),
      duration: 10,
    });
  }

  removeImage(href: string, placement: string) {
    this.wData.settings[`placement_${placement}_images`] = this.wData.settings[
      `placement_${placement}_images`
    ].filter((image: { href: string }) => image.href !== href);
    this.save();
  }
}
