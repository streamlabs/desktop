import React from 'react';
import { CommonPlatformFields } from '../CommonPlatformFields';
import Form from '../../../shared/inputs/Form';
import { createBinding, InputComponent, TagsInput } from '../../../shared/inputs';
import PlatformSettingsLayout, { IPlatformComponentParams } from './PlatformSettingsLayout';
import { IPatreonStartStreamOptions } from '../../../../services/platforms/patreon';
import { $t } from 'services/i18n/i18n';
import { Services } from 'components-react/service-provider';

/***
 * Stream Settings for Patreon
 */
export const PatreonEditStreamInfo = InputComponent((p: IPlatformComponentParams<'patreon'>) => {
  const { PatreonService } = Services;

  function updateSettings(patch: Partial<IPatreonStartStreamOptions>) {
    p.onChange({ ...patreonSettings, ...patch });
  }

  const patreonSettings = p.value;
  const bind = createBinding(patreonSettings, newPatreonSettings =>
    updateSettings(newPatreonSettings),
  );

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
          <TagsInput
            label={$t('Audience')}
            placeholder={$t('Select Tier')}
            {...bind.accessRules}
            options={PatreonService.accessRules}
            layout={p.layout}
          />
        }
      />
    </Form>
  );
});
