import React from 'react';
import PlatformSettingsLayout, { IPlatformComponentParams } from './PlatformSettingsLayout';
import { ITrovoStartStreamOptions, TrovoService } from '../../../../services/platforms/trovo';
import { createBinding } from '../../../shared/inputs';
import Form from '../../../shared/inputs/Form';
import { CommonPlatformFields } from '../CommonPlatformFields';
import GameSelector from '../GameSelector';
import { CustomFieldsCheckbox } from '../CustomFieldsCheckbox';

export function TrovoEditStreamInfo(p: IPlatformComponentParams<'trovo'>) {
  const trSettings = p.value;

  function updateSettings(patch: Partial<ITrovoStartStreamOptions>) {
    p.onChange({ ...trSettings, ...patch });
  }

  const bind = createBinding(trSettings, updatedSettings => updateSettings(updatedSettings));

  return (
    <Form name="trovo-settings">
      <PlatformSettingsLayout
        layoutMode={p.layoutMode}
        commonFields={
          <CommonPlatformFields
            key="trovo-common"
            platform="trovo"
            layoutMode={p.layoutMode}
            value={trSettings}
            onChange={updateSettings}
            layout={p.layout}
          />
        }
        requiredFields={
          <div key="trovo-required">
            <GameSelector platform="trovo" {...bind.game} layout={p.layout} />
            <CustomFieldsCheckbox {...p} platform="trovo" />
          </div>
        }
      />
    </Form>
  );
}
