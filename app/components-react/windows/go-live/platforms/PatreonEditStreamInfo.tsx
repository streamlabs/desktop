import React, { useState, useCallback, useMemo } from 'react';
import { CommonPlatformFields } from '../CommonPlatformFields';
import Form from '../../../shared/inputs/Form';
import { createBinding, InputComponent, RadioInput, TagsInput } from '../../../shared/inputs';
import PlatformSettingsLayout, { IPlatformComponentParams } from './PlatformSettingsLayout';
import { IPatreonStartStreamOptions } from '../../../../services/platforms/patreon';
import { $t } from 'services/i18n/i18n';
import { Services } from 'components-react/service-provider';
import styles from './PatreonEditStreamInfo.m.less';

type TPatreonAudienceType = 'all' | 'paid';

export const PatreonEditStreamInfo = InputComponent((p: IPlatformComponentParams<'patreon'>) => {
  const { PatreonService } = Services;

  function updateSettings(patch: Partial<IPatreonStartStreamOptions>) {
    p.onChange({ ...patreonSettings, ...patch });
  }

  const patreonSettings = p.value;
  const bind = createBinding(patreonSettings, newPatreonSettings =>
    updateSettings(newPatreonSettings),
  );

  const [audienceType, setAudienceType] = useState<TPatreonAudienceType>('all');

  const paidOptions = useMemo(
    () => PatreonService.accessRules.filter(rule => rule.label.toLowerCase() !== 'free'),
    [],
  );

  const audienceOptions = useMemo(
    () => [
      { value: 'all', label: $t('All Members') },
      {
        value: 'paid',
        label: $t('Paid'),
        children: (
          <TagsInput
            placeholder={$t('Select Tier')}
            {...bind.accessRules}
            value={audienceType === 'all' ? undefined : patreonSettings.accessRules}
            options={paidOptions}
            layout="horizontal"
            disabled={audienceType === 'all'}
            style={{ width: '100%', flex: 1 }}
            maxTagCount="responsive"
            nomargin
            nolabel
          />
        ),
      },
    ],
    [audienceType, paidOptions],
  );

  const updateAudienceType = useCallback((value: TPatreonAudienceType) => {
    setAudienceType(value);
    if (value === 'all') {
      const rules = PatreonService.accessRules.map(rule => rule.value);
      updateSettings({ accessRules: rules });
    }
  }, []);

  return (
    <Form name="patreon-settings">
      <PlatformSettingsLayout
        layoutMode={p.layoutMode}
        commonFields={
          <CommonPlatformFields
            key="patreon-common"
            platform="patreon"
            layoutMode={p.layoutMode}
            value={patreonSettings}
            onChange={updateSettings}
            layout={p.layout}
          />
        }
        requiredFields={
          <RadioInput
            name="patreon-audience"
            label={$t('Audience')}
            options={audienceOptions}
            value={audienceType}
            onChange={value => updateAudienceType(value as TPatreonAudienceType)}
            layout="inline"
            direction="horizontal"
            className={styles.patreonTags}
            required
          />
        }
      />
    </Form>
  );
});
