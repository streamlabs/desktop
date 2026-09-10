import React from 'react';
import PlatformSettingsLayout, { IPlatformComponentParams } from './PlatformSettingsLayout';
import {
  ETwitterChatType,
  ITwitterStartStreamOptions,
  TwitterPlatformService,
  TWITTER_DESCRIPTION_MAX_LENGTH,
} from '../../../../services/platforms/twitter';
import {
  ListInput,
  createBinding,
  InputComponent,
  TextAreaInput,
  CheckboxInput,
} from '../../../shared/inputs';
import InputWrapper from '../../../shared/inputs/InputWrapper';
import Form from '../../../shared/inputs/Form';
import { CommonPlatformFields } from '../CommonPlatformFields';
import { $t } from 'services/i18n';
import { CustomFieldsCheckbox } from '../CustomFieldsCheckbox';
import { inject, injectQuery, useModule } from 'slap';
import moment from 'moment';

/**
 * Duration options for the scheduler: half-hour steps from 30 minutes to 8 hours,
 * which covers any realistic stream. X's own limit is 24h, so there's headroom to
 * extend this if anyone asks for it.
 *
 * Built on demand rather than at module scope, because `$t` needs the i18n service
 * and this module is imported before that service exists.
 */
function getDurationOptions() {
  return Array.from({ length: 16 }, (_, i) => {
    const minutes = (i + 1) * 30;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    let label: string;
    if (hours === 0) {
      label = $t('%{minutes} min', { minutes: mins });
    } else if (mins === 0) {
      label = $t('%{hours} hr', { hours });
    } else {
      label = $t('%{hours} hr %{minutes} min', { hours, minutes: mins });
    }

    return { value: minutes * 60 * 1000, label };
  });
}

export const TwitterEditStreamInfo = InputComponent((p: IPlatformComponentParams<'twitter'>) => {
  const twSettings = p.value;
  const isScheduleMode = !!p.isScheduleMode;

  function updateSettings(patch: Partial<ITwitterStartStreamOptions>) {
    p.onChange({ ...twSettings, ...patch });
  }

  const bind = createBinding(twSettings, updatedSettings => updateSettings(updatedSettings));

  const { broadcastsQuery } = useModule(() => {
    const twitter = inject(TwitterPlatformService);

    async function fetchBroadcasts() {
      // Only ever returns broadcasts that haven't started, so everything here is
      // a valid thing to go live on. Nothing to filter out.
      return await twitter.actions.return.fetchScheduledBroadcasts();
    }

    return { broadcastsQuery: injectQuery([], fetchBroadcasts) };
  });

  /**
   * Lets the user bind this stream to a broadcast they scheduled earlier. Core
   * publishes it once our feed reaches X. Leaving it empty just streams ad-hoc.
   *
   * Deliberately not YouTube's BroadcastInput: that renders thumbnails, which X
   * has no equivalent for.
   */
  function renderBroadcastPicker() {
    const options = [
      { value: '', label: $t("Don't use a scheduled broadcast") },
      ...broadcastsQuery.data.map(broadcast => ({
        value: broadcast.broadcast_id,
        label: `${broadcast.title} (${moment(
          parseInt(broadcast.scheduled_start_ms, 10),
        ).calendar()})`,
      })),
    ];

    return (
      <div key="twitter-essential">
        <ListInput
          {...bind.broadcastId}
          label={$t('Scheduled Broadcast')}
          loading={broadcastsQuery.isLoading}
          options={options}
          placeholder={$t("Don't use a scheduled broadcast")}
          disabled={p.isUpdateMode}
          layout={p.layout}
          size="large"
        />
      </div>
    );
  }

  /**
   * X's schedule payload takes a title, description, duration and publish mode.
   * Chat type belongs to stream/start, not to the schedule, so it's omitted here.
   */
  function renderScheduleFields() {
    return (
      <div key="twitter-schedule">
        <TextAreaInput
          {...bind.description}
          label={$t('Description')}
          maxLength={TWITTER_DESCRIPTION_MAX_LENGTH}
          showCount
          rows={3}
          layout={p.layout}
        />
        <ListInput
          {...bind.durationMs}
          label={$t('Duration')}
          options={getDurationOptions()}
          layout={p.layout}
          size="large"
        />
        <InputWrapper label={$t('Publish when I start streaming')} layout="vertical" nolabel>
          <CheckboxInput
            {...bind.manualPublish}
            label={$t('Publish when I start streaming')}
            tooltip={$t(
              'When off, X publishes the broadcast at the scheduled time instead of waiting for you to go live',
            )}
          />
        </InputWrapper>
      </div>
    );
  }

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
        essentialOptionalFields={isScheduleMode ? undefined : renderBroadcastPicker()}
        requiredFields={
          isScheduleMode ? (
            renderScheduleFields()
          ) : (
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
          )
        }
      />
    </Form>
  );
});
