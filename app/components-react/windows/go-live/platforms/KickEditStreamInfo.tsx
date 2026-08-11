import React from 'react';
import { CommonPlatformFields } from '../CommonPlatformFields';
import Form from '../../../shared/inputs/Form';
import { createBinding, InputComponent } from '../../../shared/inputs';
import PlatformSettingsLayout, { IPlatformComponentParams } from './PlatformSettingsLayout';
import { IKickStartStreamOptions } from '../../../../services/platforms/kick';
import GameSelector from '../GameSelector';
import { CustomFieldsCheckbox } from '../CustomFieldsCheckbox';

/***
 * Stream Settings for Kick
 */
export const KickEditStreamInfo = InputComponent((p: IPlatformComponentParams<'kick'>) => {
  function updateSettings(patch: Partial<IKickStartStreamOptions>) {
    p.onChange({ ...kickSettings, ...patch });
  }

  const kickSettings = p.value;
  const bind = createBinding(kickSettings, newKickSettings => updateSettings(newKickSettings));

  return (
    <Form name="kick-settings">
      <PlatformSettingsLayout
        layoutMode={p.layoutMode}
        commonFields={
          <CommonPlatformFields
            key="kick-common"
            platform="kick"
            layoutMode={p.layoutMode}
            value={kickSettings}
            onChange={updateSettings}
            layout={p.layout}
          />
        }
        requiredFields={
          <div key="kick-required">
            <GameSelector key="required" platform={'kick'} {...bind.game} layout={p.layout} />
            <CustomFieldsCheckbox {...p} platform="kick" />
          </div>
        }
      />
    </Form>
  );
});
