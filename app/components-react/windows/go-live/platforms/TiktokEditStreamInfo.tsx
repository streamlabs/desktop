import React, { memo } from 'react';
import Form from '../../../shared/inputs/Form';
import { $t } from '../../../../services/i18n';
import { Services } from '../../../service-provider';
import { Button, Tooltip } from 'antd';
import Tabs from 'components-react/shared/Tabs';
import InputWrapper from '../../../shared/inputs/InputWrapper';
import PlatformSettingsLayout, { IPlatformComponentParams } from './PlatformSettingsLayout';
import * as remote from '@electron/remote';
import { CommonPlatformFields } from '../CommonPlatformFields';
import { ITikTokStartStreamOptions } from 'services/platforms/tiktok';
import {
  RadioInput,
  TextInput,
  createBinding,
  InputComponent,
} from 'components-react/shared/inputs';
import Translate from 'components-react/shared/Translate';
import GameSelector from '../GameSelector';
import { CustomFieldsCheckbox } from '../CustomFieldsCheckbox';
import InfoBadge from 'components-react/shared/InfoBadge';
import styles from './TikTokEditStreamInfo.m.less';

/**
 * @remark The filename for this component is intentionally not consistent with capitalization to preserve the commit history
 */
export const TikTokEditStreamInfo = InputComponent((p: IPlatformComponentParams<'tiktok'>) => {
  const ttSettings = p.value;

  function updateSettings(patch: Partial<ITikTokStartStreamOptions>) {
    p.onChange({ ...ttSettings, ...patch });
  }
  return (
    <Form name="tiktok-settings">
      <PlatformSettingsLayout
        layoutMode={p.layoutMode}
        commonFields={
          <CommonPlatformFields
            key="tiktok-common"
            platform="tiktok"
            layoutMode={p.layoutMode}
            value={ttSettings}
            onChange={updateSettings}
            layout={p.layout}
          />
        }
        requiredFields={<TikTokRequired key="tiktok-required" {...p} />}
      />
    </Form>
  );
});

const TikTokLiveAccessForm = memo((p: IPlatformComponentParams<'tiktok'>) => {
  const { TikTokService } = Services;
  const bind = createBinding(p.value, updatedSettings =>
    p.onChange({ ...p.value, ...updatedSettings }),
  );

  const controls = TikTokService.audienceControls;
  const approved = TikTokService.scope === 'approved';

  return (
    <>
      {approved ? (
        <div>
          <InfoBadge
            size="sm"
            color="var(--primary)"
            bgColor="lighten(--primary, 8%)"
            content={
              <>
                <i className="icon-check" />
                <span>{$t('Streamlabs access enabled')}</span>
              </>
            }
          />
          <GameSelector
            platform={'tiktok'}
            {...bind.game}
            layout="vertical"
            labelAlign="left"
            style={{ marginBottom: '4px' }}
            description={
              <Translate
                message={$t(
                  'Stream at least 50% gaming content to maintain TikTok streaming access. <link>Learn more</link>',
                )}
                style={{ fontSize: '14px', fontStyle: 'normal' }}
              >
                <a onClick={openInfoPage} slot="link" style={{ textDecoration: 'underline' }} />
              </Translate>
            }
          />

          {!controls.disable && (
            <RadioInput
              options={controls.types}
              defaultValue={controls.audienceType}
              value={controls.audienceType}
              label={$t('TikTok Audience')}
              direction="horizontal"
              colon
              {...bind.audienceType}
              layout="vertical"
              style={{ marginTop: '10px' }}
              labelAlign="left"
            />
          )}
          <CustomFieldsCheckbox
            {...p}
            platform="tiktok"
            onChange={newSettings => p.onChange({ ...p.value, ...newSettings })}
          />
        </div>
      ) : (
        <TikTokInfo />
      )}
    </>
  );
});

const TikTokStreamKeyForm = memo((p: IPlatformComponentParams<'tiktok'>) => {
  const bind = createBinding(p.value, updatedSettings =>
    p.onChange({ ...p.value, ...updatedSettings }),
  );

  return (
    <>
      <Translate
        message={$t(
          'Use your TikTok stream key to stream. Stream Keys are granted by TikTok and renew after each session. <link>See Guide</link>',
        )}
      >
        <a
          onClick={openInfoPage}
          slot="link"
          style={{ textDecoration: 'underline', color: 'var(--paragraph)' }}
        />
      </Translate>
      <TextInput
        label={
          <Tooltip title={$t('Generate with "Locate my Stream Key"')} placement="right">
            {$t('TikTok Server URL')}
            <i className="icon-information" style={{ marginLeft: '5px' }} />
          </Tooltip>
        }
        required
        {...bind.serverUrl}
        layout="horizontal"
        size="large"
        labelAlign="left"
        style={{ marginTop: '24px', fontSize: '14px' }}
      />
      <TextInput
        label={
          <Tooltip title={$t('Generate with "Locate my Stream Key"')} placement="right">
            {$t('TikTok Stream Key')}
            <i className="icon-information" style={{ marginLeft: '5px' }} />
          </Tooltip>
        }
        required
        {...bind.streamKey}
        layout="horizontal"
        size="large"
        style={{ marginBottom: '10px', fontSize: '14px' }}
        labelAlign="left"
      />
      <InputWrapper layout="horizontal">
        <Button onClick={openProducer} style={{ width: '100%', marginBottom: '8px' }}>
          {$t('Locate my Stream Key')}
        </Button>
        <Translate
          message={$t("Can't find your stream key? <link>Click here</link>")}
          style={{ fontSize: '12px' }}
        >
          <a onClick={openProducer} style={{ textDecoration: 'underline' }} slot="link" />
        </Translate>
        <CustomFieldsCheckbox
          {...p}
          platform="tiktok"
          layout="horizontal"
          onChange={newSettings => p.onChange({ ...p.value, ...newSettings })}
        />
      </InputWrapper>
    </>
  );
});

function TikTokInfo() {
  return (
    <>
      <Translate
        message={$t(
          'Request access to stream without a stream key directly through Streamlabs. You must stream at least 50% gaming content continuously. <link>Learn more</link>',
        )}
      >
        <a onClick={openInfoPage} slot="link" style={{ textDecoration: 'underline' }} />
      </Translate>
      <Button onClick={openApplicationInfoPage} className={styles.tiktokApply}>
        {$t('Request streaming access through Streamlabs')}
        <i className="icon-pop-out-2" />
      </Button>
    </>
  );
}

function TikTokButtons(p: { denied: boolean }) {
  const status = Services.TikTokService.promptApply ? 'prompted' : 'not-prompted';
  const component = Services.TikTokService.promptReapply ? 'ReapplyButton' : 'ApplyButton';
  const text = Services.TikTokService.promptReapply
    ? $t('Reapply for TikTok Live Permission')
    : $t('Apply for TikTok Live Permission');

  const data = {
    component,
    status: !p.denied ? status : undefined,
  };

  return (
    <>
      <Button
        id="tiktok-locate-key"
        onClick={openProducer}
        style={{ marginBottom: '10px', width: '100%' }}
      >
        {$t('Locate my Stream Key')}
      </Button>

      <Button
        id="tiktok-application"
        onClick={() => {
          Services.UsageStatisticsService.recordAnalyticsEvent('TikTokApplyPrompt', data);
          openApplicationInfoPage();
        }}
        className={styles.tiktokApply}
      >
        {text}
      </Button>
    </>
  );
}

const TikTokRequired = memo((p: IPlatformComponentParams<'tiktok'>) => {
  return (
    <>
      <Tabs
        type="card"
        moreIcon={null}
        tabBarGutter={0}
        subType="filled"
        tabs={[
          {
            label: (
              <>
                <span>{$t('Streamlabs Access')}</span>
                <InfoBadge content={$t('Recommended')} size="sm" className={styles.tiktokBadge} />
              </>
            ),
            id: 'live-access',
            content: <TikTokLiveAccessForm {...p} />,
          },
          {
            label: $t('Stream with TikTok Stream Key'),
            id: 'stream-key',
            content: <TikTokStreamKeyForm {...p} />,
          },
        ]}
      />
    </>
  );
});

function openInfoPage() {
  remote.shell.openExternal(Services.TikTokService.infoUrl);
}

function openApplicationInfoPage() {
  remote.shell.openExternal(Services.TikTokService.applicationUrl);
}

function openProducer() {
  remote.shell.openExternal(Services.TikTokService.legacyDashboardUrl);
}
