import React, { useEffect, useRef, useState } from 'react';
import debounce from 'lodash/debounce';
import pick from 'lodash/pick';
import { Services } from '../../service-provider';
import { useVuex } from '../../hooks';
import Form from '../../shared/inputs/Form';
import InputWrapper from '../../shared/inputs/InputWrapper';
import { CheckboxInput, ListInput, NumberInput, TextInput } from '../../shared/inputs';
import { ISourceApi } from '../../../services/sources';
import { IStreamlabelDefinition, IStreamlabelSettings } from '../../../services/streamlabels';
import { $t } from '../../../services/i18n';
import styles from './StreamlabelProperties.m.less';

interface IProps {
  source: ISourceApi;
  onUpdate?: () => void;
}

const SAMPLE_ITEM_DATA = [
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

function getPreview(file: IStreamlabelDefinition, settings: IStreamlabelSettings) {
  if (settings.format == null) return '';
  const isBits = /cheer/.test(file.name);

  let replaced = settings.format
    .replace(/{name}/gi, 'Fishstickslol')
    .replace(/{title}/gi, 'New Computer')
    .replace(/{currentAmount}/gi, '$12')
    .replace(/{count}/gi, '123')
    .replace(/{goalAmount}/gi, '$47')
    .replace(/{amount}/gi, isBits ? '499 Bits' : '$4.99')
    .replace(/{months}/gi, '3')
    .replace(/{either_amount}/gi, ['$4.99', '499 Bits'][Math.floor(Math.random() * 2)]);

  if (settings.item_format) {
    const itemFormat = settings.item_format;
    const itemStr = SAMPLE_ITEM_DATA.map(data =>
      itemFormat
        .replace(/{name}/gi, data.name)
        .replace(/{months}/gi, data.months)
        .replace(/{amount}/gi, data.amount)
        .replace(
          /{either_amount}/gi,
          [data.amount, data.bits_amount][Math.floor(Math.random() * 2)],
        )
        .replace(/{message}/gi, data.message),
    ).join(settings.item_separator as string);
    replaced = replaced.replace(/{list}/gi, itemStr);
  }

  return replaced;
}

const TEMPLATE_LABELS = {
  format: () => $t('Label Template'),
  item_format: () => $t('Item Template'),
  item_separator: () => $t('Item Separator'),
};

function getSettingsStat(file: IStreamlabelDefinition) {
  return file?.settings?.settingsStat ? file.settings.settingsStat : file.name;
}

export default function StreamlabelProperties(p: IProps) {
  const { StreamlabelsService } = Services;

  const definitions = useVuex(() => StreamlabelsService.state.definitions);
  const statOptions = definitions ? Object.values(definitions) : undefined;

  const [file, setFile] = useState<IStreamlabelDefinition | null>(null);
  const [settings, setSettings] = useState<IStreamlabelSettings | null>(null);

  // always points to the latest values for the debounced save
  const latest = useRef({ file, settings });
  latest.current = { file, settings };

  function loadFile(selected: IStreamlabelDefinition) {
    let labelSettings = StreamlabelsService.getSettingsForStat(getSettingsStat(selected));
    if (selected?.settings?.settingsWhitelist) {
      labelSettings = pick(
        labelSettings,
        selected.settings.settingsWhitelist,
      ) as IStreamlabelSettings;
    }
    const next = { ...labelSettings };
    latest.current = { file: selected, settings: next };
    setFile(selected);
    setSettings(next);
  }

  function refreshPropertyValues() {
    if (!statOptions) return;

    const statname = p.source.getPropertiesManagerSettings().statname;
    let found: IStreamlabelDefinition | undefined;
    statOptions.forEach(category => {
      category.files.forEach(f => {
        if (f.name === statname) found = f;
      });
    });

    // Default to first selectable label if none matching settings are found
    const selected = found ?? statOptions[0]?.files[0];
    if (selected) loadFile(selected);
  }

  useEffect(refreshPropertyValues, [definitions]);

  function save() {
    const { file: currentFile, settings: currentSettings } = latest.current;
    if (!currentFile || !currentSettings) return;
    const clamped = { ...currentSettings };

    if (clamped.limit) {
      let limit = parseInt(clamped.limit as any, 10);
      if (isNaN(limit) || limit < 0) limit = 0;
      if (limit > 100) limit = 100;
      clamped.limit = limit;
    }

    if (clamped.duration) {
      let duration = parseInt(clamped.duration as any, 10);
      if (isNaN(duration) || duration < 1) duration = 1;
      clamped.duration = duration;
    }

    latest.current = { file: currentFile, settings: clamped };
    setSettings(clamped);
    StreamlabelsService.setSettingsForStat(getSettingsStat(currentFile), clamped);
  }

  const debouncedSave = useRef(debounce(save, 1000)).current;

  // don't lose pending changes when the window is closed
  useEffect(() => () => debouncedSave.flush(), []);

  function handleStatChange(statname: string) {
    // apply pending changes to the previous label before switching
    debouncedSave.flush();
    p.source.setPropertiesManagerSettings({ statname });
    refreshPropertyValues();
  }

  function setValue<K extends keyof IStreamlabelSettings>(key: K, value: IStreamlabelSettings[K]) {
    const next = { ...latest.current.settings, [key]: value } as IStreamlabelSettings;
    latest.current = { ...latest.current, settings: next };
    setSettings(next);
    debouncedSave();
  }

  if (!settings || !file || !statOptions) return null;

  const tokens = (key: 'format' | 'item_format' | 'item_separator') =>
    $t('Tokens: %{tokenList}', { tokenList: file.settings?.[key]?.tokens.join(' ') });

  const showOptions = (inactiveText: string) => [
    { label: inactiveText, value: 'always' },
    { label: $t('Hide when inactive'), value: 'active' },
  ];

  const inputFor = (key: keyof IStreamlabelSettings) => {
    switch (key) {
      case 'format':
      case 'item_format':
      case 'item_separator':
        return (
          <TextInput
            key={key}
            label={TEMPLATE_LABELS[key]()}
            extra={tokens(key)}
            value={settings[key] as string}
            onChange={val => setValue(key, val)}
          />
        );
      case 'limit':
        return (
          <TextInput
            key={key}
            label={$t('Item Limit')}
            value={settings.limit != null ? String(settings.limit) : ''}
            onChange={val => setValue('limit', val as any)}
          />
        );
      case 'duration':
        return (
          <NumberInput
            key={key}
            label={$t('Duration')}
            value={settings.duration}
            step={1}
            onChange={val => setValue('duration', val)}
          />
        );
      case 'show_clock':
        return (
          <ListInput
            key={key}
            label={$t('Show Clock')}
            value={settings.show_clock}
            options={showOptions($t('Always, show 0:00 when inactive'))}
            allowClear={false}
            onChange={val => setValue('show_clock', val as 'always' | 'active')}
          />
        );
      case 'show_count':
        return (
          <ListInput
            key={key}
            label={$t('Show Count')}
            value={settings.show_count}
            options={showOptions($t('Always, show 0 when inactive'))}
            allowClear={false}
            onChange={val => setValue('show_count', val as 'always' | 'active')}
          />
        );
      case 'show_latest':
        return (
          <ListInput
            key={key}
            label={$t('Show Latest')}
            value={settings.show_latest}
            options={showOptions($t('Always, show last person when inactive'))}
            allowClear={false}
            onChange={val => setValue('show_latest', val as 'always' | 'active')}
          />
        );
      case 'include_resubs':
        return (
          <CheckboxInput
            key={key}
            label={$t('Include Resubs')}
            value={!!settings.include_resubs}
            onChange={val => setValue('include_resubs', val)}
          />
        );
      default:
        return null;
    }
  };

  const groupedOptions = statOptions.map(category => ({
    label: category.label,
    options: category.files.map(def => ({ label: def.label, value: def.name })),
  }));

  return (
    <Form layout="horizontal" name="streamlabel-properties">
      <ListInput
        label={$t('Label Type')}
        value={file.name}
        options={groupedOptions as any}
        allowClear={false}
        onChange={handleStatChange}
      />
      {(Object.keys(settings) as (keyof IStreamlabelSettings)[]).map(inputFor)}
      {settings.format != null && (
        <InputWrapper label={$t('Preview')}>
          <div className={styles.preview}>
            {getPreview(file, settings)
              .split('\\n')
              .map((line, i) => (
                <div key={i}>{line}</div>
              ))}
          </div>
          <div className={styles.previewNote}>
            {$t('Note: Actual label text may take up to 60 seconds to update')}
          </div>
        </InputWrapper>
      )}
    </Form>
  );
}
