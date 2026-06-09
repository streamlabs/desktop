import React, { useMemo, useState, useCallback } from 'react';
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

  const patreonSettings = p.value;

  function updateSettings(patch: Partial<IPatreonStartStreamOptions>) {
    if ('accessRules' in patch && !('title' in patch)) {
      // Prevent clearing the title when only updating access rules
      p.onChange(patch);
    } else {
      p.onChange({ ...patreonSettings, ...patch });
    }
  }

  const bind = createBinding(patreonSettings, updatedSettings => updateSettings(updatedSettings));

  // Memoize tier options and related values to avoid unnecessary calculations on each render
  const { allTiersRule, tierOptions, allRuleValues, allTiersValue } = useMemo(() => {
    const rules = PatreonService.accessRules;
    const paidRule = rules.find(rule => rule.label.toLowerCase() === 'paid');
    return {
      allTiersRule: paidRule,
      tierOptions: rules.filter(
        rule => rule.label.toLowerCase() !== 'free' && rule.value !== paidRule?.value,
      ),
      allRuleValues: rules.map(rule => rule.value),
      allTiersValue: paidRule?.value,
    };
    // Note: PatreonService.accessRules is assumed to be static or memoized itself
    // so it's safe to omit it from dependencies
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [audienceType, setAudienceType] = useState<TPatreonAudienceType>(() => {
    const ruleCount = patreonSettings.accessRules.length;
    return ruleCount === 0 || ruleCount === allRuleValues.length ? 'all' : 'paid';
  });

  const allTiersSelected = useMemo(() => {
    const saved = patreonSettings.accessRules;
    if (allTiersValue && saved.length === 1 && saved[0] === allTiersValue) return true;
    return saved.length === 0;
  }, [patreonSettings.accessRules, allTiersValue]);

  function updateAudienceType(value: TPatreonAudienceType) {
    setAudienceType(value);
    if (value === 'all') {
      updateSettings({ accessRules: allRuleValues });
    } else {
      updateSettings({ accessRules: allTiersValue ? [allTiersValue] : [] });
    }
  }

  function onTagsChange(newValues: string[]) {
    const addedAllTiers = !!allTiersValue && newValues.includes(allTiersValue) && !allTiersSelected;
    const stripped = allTiersValue ? newValues.filter(v => v !== allTiersValue) : newValues;

    if (newValues.length === 0) {
      updateSettings({ accessRules: allTiersValue ? [allTiersValue] : [] });
      return;
    }

    if (addedAllTiers) {
      updateSettings({ accessRules: [allTiersValue!] });
      return;
    }

    updateSettings({ accessRules: stripped });
  }

  const tagsValue = useMemo(() => {
    return allTiersSelected && allTiersValue ? [allTiersValue] : patreonSettings.accessRules;
  }, [patreonSettings.accessRules, allTiersSelected, allTiersValue]);

  const tagsOptions = useMemo(() => {
    return allTiersRule
      ? [{ ...allTiersRule, label: $t('All Tiers') }, ...tierOptions]
      : tierOptions;
  }, [allTiersRule, tierOptions]);

  const audienceOptions = [
    { value: 'all', label: $t('All Members') },
    {
      value: 'paid',
      label: $t('Paid'),
      children:
        audienceType === 'paid' ? (
          <TagsInput
            placeholder={$t('Select Tier')}
            {...bind.accessRules}
            value={tagsValue}
            onChange={onTagsChange}
            options={tagsOptions}
            layout="horizontal"
            style={{ width: '100%', flex: 1 }}
            maxTagCount="responsive"
            nomargin
            nolabel
          />
        ) : null,
    },
  ];

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
            label={$t('Patreon Audience')}
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
