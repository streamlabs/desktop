import React, { useState } from 'react';
import Form from '../../../shared/inputs/Form';
import { $t } from '../../../../services/i18n';
import { Services } from '../../../service-provider';
import { Button } from 'antd';
import PlatformSettingsLayout, { IPlatformComponentParams } from './PlatformSettingsLayout';
import * as remote from '@electron/remote';
import { CommonPlatformFields } from '../CommonPlatformFields';
import { ITikTokStartStreamOptions } from 'services/platforms/tiktok';
import { RadioInput, TextInput, createBinding } from 'components-react/shared/inputs';
import Translate from 'components-react/shared/Translate';
import Tooltip from 'components-react/shared/Tooltip';
import InputWrapper from 'components-react/shared/inputs/InputWrapper';
import GameSelector from '../GameSelector';
import InfoBadge from 'components-react/shared/InfoBadge';

type TTikTokLiveMode = 'live' | 'streamKey';

/**
 * @remark The filename for this component is intentionally not consistent with capitalization to preserve the commit history
 */
export function TikTokEditStreamInfo(p: IPlatformComponentParams<'tiktok'>) {
  const ttSettings = p.value;

  const [mode, setMode] = useState<TTikTokLiveMode>('live');

  const options = [
    {
      label: $t('Streamlabs Access'),
      value: 'live',
    },
    {
      label: $t('Stream with TikTok Stream Key'),
      value: 'legacy',
      content: <InfoBadge content={$t('Recommended')} />,
    },
  ];

  function updateSettings(patch: Partial<ITikTokStartStreamOptions>) {
    p.onChange({ ...ttSettings, ...patch });
  }

  return (
    <Form name="tiktok-settings" wrapperCol={{ span: 24 }} layout="vertical" labelAlign="left">
      <RadioInput
        label={$t('TikTok Stream Method')}
        nolabel
        value={mode}
        options={options}
        onChange={value => setMode(value as TTikTokLiveMode)}
        buttons={true}
        direction="horizontal"
        style={{ display: 'flex', width: '100%', flex: 1 }}
        fullWidth
        buttonStyle="solid"
        wrapperStyle={{ width: '100%', flex: 1, display: 'flex' }}
      />

      <PlatformSettingsLayout
        layoutMode={p.layoutMode}
        commonFields={
          <CommonPlatformFields
            key="common"
            platform="tiktok"
            layoutMode={p.layoutMode}
            value={ttSettings}
            onChange={updateSettings}
            layout={p.layout}
          />
        }
        requiredFields={
          mode === 'live' ? <TikTokLiveAccessForm {...p} /> : <TikTokStreamKeyForm {...p} />
        }
      />
    </Form>
  );
}

function TikTokLiveAccessForm(p: IPlatformComponentParams<'tiktok'>) {
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
            size="lg"
            content={
              <>
                <i className="icon-check" />
                {$t('Streamlabs access enabled')}
              </>
            }
          />
          <GameSelector
            key="optional"
            platform={'tiktok'}
            {...bind.game}
            layout="horizontal"
            labelAlign="left"
            style={{ marginBottom: '4px !important' }}
          />
          <Translate
            message={$t(
              'Stream at least 50% gaming content to maintain TikTok streaming access. <link>Learn more</link>',
            )}
          >
            <a onClick={openInfoPage} slot="link" style={{ textDecoration: 'underline' }} />
          </Translate>
          {!controls.disable && (
            <RadioInput
              key="audience-ctrl"
              options={controls.types}
              defaultValue={controls.audienceType}
              value={controls.audienceType}
              label={$t('TikTok Audience')}
              direction="horizontal"
              colon
              {...bind.audienceType}
              layout={p.layout}
              style={{ marginBottom: '10px' }}
            />
          )}
        </div>
      ) : (
        <TikTokInfo />
      )}
    </>
  );
}

export function TikTokStreamKeyForm(p: IPlatformComponentParams<'tiktok'>) {
  const bind = createBinding(p.value, updatedSettings =>
    p.onChange({ ...p.value, ...updatedSettings }),
  );

  openApplicationInfoPage;

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
        style={{ marginTop: '24px' }}
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
        style={{ marginBottom: '10px' }}
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
      </InputWrapper>
    </>
  );
}

function TikTokInfo() {
  return (
    <>
      <Translate
        message={$t(
          'Request access to stream without a stream key directly through Streamlabs. You must stream at least 50% gaming content continuously. <link>Learn more</link>',
        )}
      >
        <u>
          <a onClick={openInfoPage} slot="link" />
        </u>
      </Translate>
      <Button onClick={openApplicationInfoPage}>
        {$t('Request streaming access through Streamlabs')}
        <i className="icon-pop-out-2" style={{ marginLeft: '5px' }} />
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
        style={{
          width: '100%',
          marginBottom: '10px',
          background: 'var(--tiktok-btn)',
          color: 'var(--black)',
        }}
      >
        {text}
      </Button>
    </>
  );
}

function openInfoPage() {
  remote.shell.openExternal(Services.TikTokService.infoUrl);
}

function openApplicationInfoPage() {
  remote.shell.openExternal(Services.TikTokService.applicationUrl);
}

function openProducer() {
  remote.shell.openExternal(Services.TikTokService.legacyDashboardUrl);
}

function openConfirmation() {
  remote.shell.openExternal(Services.TikTokService.confirmationUrl);
}
