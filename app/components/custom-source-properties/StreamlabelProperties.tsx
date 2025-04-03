import Vue from 'vue';
import { Component, Prop } from 'vue-property-decorator';
import { ISourceApi } from 'services/sources';
import { Inject } from 'services/core/injector';
import { UserService } from 'services/user';
import HFormGroup from 'components/shared/inputs/HFormGroup.vue';
import {
  StreamlabelsService,
  IStreamlabelSettings,
  IStreamlabelDefinition,
  IStreamlabelSet,
} from 'services/streamlabels';
import debounce from 'lodash/debounce';
import pick from 'lodash/pick';
import { metadata } from 'components/widgets/inputs';
import { formMetadata } from 'components/shared/inputs';
import { $t } from 'services/i18n';

@Component({
  components: { HFormGroup },
})
export default class StreamlabelProperties extends Vue {
  @Prop() source: ISourceApi;

  @Inject() userService: UserService;
  @Inject() streamlabelsService: StreamlabelsService;

  get statOptions() {
    if (!this.streamlabelsService.state.definitions) return;
    return Object.values(this.streamlabelsService.state.definitions);
  }

  currentlySelected: IStreamlabelDefinition = null;
  labelSettings: IStreamlabelSettings = null;

  async created() {
    this.refreshPropertyValues();
    this.debouncedSetSettings = debounce(() => this.setSettings(), 1000);
  }

  refreshPropertyValues() {
    if (!this.statOptions) return;

    const settings = this.source.getPropertiesManagerSettings();

    this.statOptions.forEach(category => {
      category.files.forEach(file => {
        if (file.name === settings.statname) {
          this.currentlySelected = file;
          let settingsStat = file.name;

          if (file?.settings?.settingsStat) settingsStat = file.settings.settingsStat;

          this.labelSettings = this.streamlabelsService.getSettingsForStat(settingsStat);

          if (file?.settings?.settingsWhitelist) {
            this.labelSettings = pick(
              this.labelSettings,
              file.settings.settingsWhitelist,
            ) as IStreamlabelSettings;
          }
        }
      });
    });

    // Default to first selectable label if none matching settings are found
    if (!this.labelSettings) this.defaultToFirstLabel();
  }

  defaultToFirstLabel() {
    const file = this.statOptions[0]?.files[0];
    this.currentlySelected = file;
    let settingsStat = file.name;
    if (file?.settings?.settingsStat) settingsStat = file.settings.settingsStat;
    this.labelSettings = this.streamlabelsService.getSettingsForStat(settingsStat);
    if (file?.settings?.settingsWhitelist) {
      this.labelSettings = pick(
        this.labelSettings,
        file.settings.settingsWhitelist,
      ) as IStreamlabelSettings;
    }
  }

  handleInput(value: string) {
    this.source.setPropertiesManagerSettings({ statname: value });
    this.refreshPropertyValues();
  }

  debouncedSetSettings: () => void;

  setSettings() {
    if (this.labelSettings.limit) {
      this.labelSettings.limit = parseInt(this.labelSettings.limit as any, 10);
      if (isNaN(this.labelSettings.limit)) this.labelSettings.limit = 0;
      if (this.labelSettings.limit < 0) this.labelSettings.limit = 0;
      if (this.labelSettings.limit > 100) this.labelSettings.limit = 100;
    }

    if (this.labelSettings.duration) {
      this.labelSettings.duration = parseInt(this.labelSettings.duration as any, 10);
      if (isNaN(this.labelSettings.duration)) this.labelSettings.duration = 1;
      if (this.labelSettings.duration < 1) this.labelSettings.duration = 1;
    }

    this.streamlabelsService.setSettingsForStat(
      this.currentlySelected?.settings?.settingsStat
        ? this.currentlySelected.settings.settingsStat
        : this.currentlySelected.name,
      this.labelSettings,
    );
  }

  /**
   * Returns the preview split on newlines
   */
  get splitPreview() {
    return this.preview.split('\\n');
  }

  get preview() {
    if (this.labelSettings.format == null) return '';
    const isBits = /cheer/.test(this.currentlySelected.name);

    let replaced = this.labelSettings.format
      .replace(/{name}/gi, 'Fishstickslol')
      .replace(/{title}/gi, 'New Computer')
      .replace(/{currentAmount}/gi, '$12')
      .replace(/{count}/gi, '123')
      .replace(/{goalAmount}/gi, '$47')
      .replace(/{amount}/gi, isBits ? '499 Bits' : '$4.99')
      .replace(/{months}/gi, '3')
      .replace(/{either_amount}/gi, ['$4.99', '499 Bits'][Math.floor(Math.random() * 2)]);

    if (this.labelSettings.item_format) {
      const itemStr = this.sampleItems.join(this.labelSettings.item_separator);
      replaced = replaced.replace(/{list}/gi, itemStr);
    }

    return replaced;
  }

  get sampleItems() {
    return this.sampleItemData.map(data => {
      return this.labelSettings.item_format
        .replace(/{name}/gi, data.name)
        .replace(/{months}/gi, data.months)
        .replace(/{amount}/gi, data.amount)
        .replace(
          /{either_amount}/gi,
          [data.amount, data.bits_amount][Math.floor(Math.random() * 2)],
        )
        .replace(/{message}/gi, data.message);
    });
  }

  sampleItemData = [
    {
      name: 'Fishstickslol',
      months: '5',
      amount: '$4.98',
      message: 'I love you!',
      bits_amount: '498 Bits',
    },
    {
      name: 'ChocoPie',
      months: '2',
      amount: '$5',
      message: 'I love you!',
      bits_amount: '500 Bits',
    },
    {
      name: 'Beecreative',
      months: '3',
      amount: '$1.43',
      message: 'I love you!',
      bits_amount: '143 Bits',
    },
    {
      name: 'ActionBa5tard',
      months: '1',
      amount: '$13.37',
      message: 'Love your stream!',
      bits_amount: '1337 Bits',
    },
  ];

  get metadata() {
    return formMetadata({
      labelType: metadata.sectionedMultiselect({
        title: $t('Label Type'),
        options: this.statOptions?.map(option => ({
          label: option.label,
          options: option.files.map(def => ({ label: def.label, value: def.name })),
        })) as any[],
        allowEmpty: false,
      }),
      format: metadata.text({
        title: $t('Label Template'),
        description: $t('Tokens: %{tokenList}', {
          tokenList: this.currentlySelected?.settings?.format?.tokens.join(' '),
        }),
      }),
      item_format: metadata.text({
        title: $t('Item Template'),
        description: $t('Tokens: %{tokenList}', {
          tokenList: this.currentlySelected?.settings?.item_format?.tokens.join(' '),
        }),
      }),
      item_separator: metadata.text({
        title: $t('Item Separator'),
        description: $t('Tokens: %{tokenList}', {
          tokenList: this.currentlySelected?.settings?.item_separator?.tokens.join(' '),
        }),
      }),
      limit: metadata.text({ title: $t('Item Limit') }),
      duration: metadata.number({
        title: $t('Duration'),
        isInteger: true,
      }),
      show_clock: metadata.list({
        title: $t('Show Clock'),
        options: [
          { title: $t('Always, show 0:00 when inactive'), value: 'always' },
          { title: $t('Hide when inactive'), value: 'active' },
        ],
        allowEmpty: false,
      }),
      show_count: metadata.list({
        title: $t('Show Count'),
        options: [
          { title: $t('Always, show 0 when inactive'), value: 'always' },
          { title: $t('Hide when inactive'), value: 'active' },
        ],
        allowEmpty: false,
      }),
      show_latest: metadata.list({
        title: $t('Show Latest'),
        options: [
          { title: $t('Always, show last person when inactive'), value: 'always' },
          { title: $t('Hide when inactive'), value: 'active' },
        ],
        allowEmpty: false,
      }),
      include_resubs: metadata.bool({ title: $t('Include Resubs') }),
    });
  }

  render() {
    return (
      this.labelSettings && (
        <div>
          <HFormGroup
            value={this.currentlySelected.name}
            onInput={(val: string) => this.handleInput(val)}
            metadata={this.metadata.labelType}
          />
          {Object.keys(this.labelSettings).map(key => (
            <HFormGroup
              key={key}
              vModel={this.labelSettings[key]}
              onInput={() => this.debouncedSetSettings()}
              metadata={this.metadata[key]}
            />
          ))}
          {this.labelSettings.format != null && (
            <HFormGroup title={$t('Preview')}>
              <div style="color: var(--title);">
                {this.splitPreview.map(line => (
                  <div key={line}>{line}</div>
                ))}
              </div>
              <div style="font-style: italic; opacity: 0.7;">
                {$t('Note: Actual label text may take up to 60 seconds to update')}
              </div>
            </HFormGroup>
          )}
        </div>
      )
    );
  }
}
