import React from 'react';
import PlatformSettingsLayout, { IPlatformComponentParams } from './PlatformSettingsLayout';
import {
  ETwitterChatType,
  ITwitterStartStreamOptions,
} from '../../../../services/platforms/twitter';
import { ListInput, createBinding, InputComponent } from '../../../shared/inputs';
import Form from '../../../shared/inputs/Form';
import { CommonPlatformFields } from '../CommonPlatformFields';
import { $t } from 'services/i18n';
import { CustomFieldsCheckbox } from '../CustomFieldsCheckbox';

export const TwitterEditStreamInfo = InputComponent((p: IPlatformComponentParams<'twitter'>) => {
  const twSettings = p.value;

  function updateSettings(patch: Partial<ITwitterStartStreamOptions>) {
    p.onChange({ ...twSettings, ...patch });
  }

  const bind = createBinding(twSettings, updatedSettings => updateSettings(updatedSettings));

  return (
    <Form name="twitter-settings">
      <PlatformSettingsLayout
        layoutMode={p.layoutMode}
        commonFields={
          <CommonPlatformFields
            key="twitter-common"
            platform="twitter"
            layoutMode={p.layoutMode}
            value={twSettings}
            onChange={updateSettings}
            layout={p.layout}
          />
        }
        requiredFields={
          <div key="twitter-required">
            <ListInput
              {...bind.chatType}
              label={$t('X (Twitter) Chat Type')}
              options={[
                {
                  value: ETwitterChatType.Off,
                  label: $t('Disabled'),
                  description: $t('Chat will be disabled'),
                },
                {
                  value: ETwitterChatType.Everyone,
                  label: $t('Everyone'),
                  description: $t('All viewers will be able to chat'),
                },
                {
                  value: ETwitterChatType.VerifiedOnly,
                  label: $t('Verified Only'),
                  description: $t('Only verified viewers will be able to chat'),
                },
                {
                  value: ETwitterChatType.FollowedOnly,
                  label: $t('Followed Only'),
                  description: $t('Only accounts you follow will be able to chat'),
                },
                {
                  value: ETwitterChatType.SubscribersOnly,
                  label: $t('Subscriber Only'),
                  description: $t('Only viewers that subscribe to you will be able to chat'),
                },
              ]}
              layout={p.layout}
              size="large"
            />
            <CustomFieldsCheckbox {...p} platform="twitter" />
          </div>
        }
      />
    </Form>
  );
});
