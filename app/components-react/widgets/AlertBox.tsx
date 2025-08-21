/**
 * Components for AlertBox widget
 */

import React, { useRef } from 'react';
import {
  CheckboxInput,
  MediaUrlInput,
  NumberInput,
  SliderInput,
  TextInput,
  AudioUrlInput,
  SwitchInput,
  FontFamilyInput,
  ColorInput,
  FontWeightInput,
  FontSizeInput,
  ListInput,
} from '../shared/inputs';
import { $t } from '../../services/i18n';
import { Alert, Button, Collapse, Menu, Tooltip } from 'antd';
import Form from '../shared/inputs/Form';
import { WidgetLayout } from './common/WidgetLayout';
import { CaretRightOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { TAlertType } from '../../services/widgets/alerts-config';
import { useAlertBox } from './useAlertBox';
import { Services } from '../service-provider';
import { ButtonGroup } from '../shared/ButtonGroup';
import { LayoutInput } from './common/LayoutInput';
import InputWrapper from '../shared/inputs/InputWrapper';
import * as remote from '@electron/remote';
import { assertIsDefined } from '../../util/properties-type-guards';
import { useForceUpdate } from 'slap';

/**
 * Root component
 */
export function AlertBox() {
  const { layout } = useAlertBox();
  return (
    <WidgetLayout layout={layout}>
      <TabsList />
      <TabContent />
    </WidgetLayout>
  );
}

/**
 * Renders left menu
 */
function TabsList() {
  const { onMenuClickHandler, selectedTab } = useAlertBox();
  return (
    <>
      <Menu onClick={onMenuClickHandler} selectedKeys={[selectedTab]} theme={'dark'}>
        <Menu.Item key={'general'}>{$t('General Settings')}</Menu.Item>
      </Menu>
      <AlertsList />
    </>
  );
}

/**
 * Renders selected tab content
 */
function TabContent() {
  const { selectedTab } = useAlertBox();
  return selectedTab === 'general' ? (
    <GeneralSettings />
  ) : (
    <VariationSettings type={selectedTab as TAlertType} />
  );
}

/**
 * Renders general settings
 */
function GeneralSettings() {
  const { bind, switchToLegacyAlertbox } = useAlertBox();

  function openAdvancedAlertTesting() {
    Services.MagicLinkService.actions.openAdvancedAlertTesting();
  }

  return (
    <Form layout={'horizontal'}>
      <SliderInput
        label={$t('Global Alert Delay')}
        {...bind.alert_delay}
        step={1000}
        min={0}
        max={30000}
        tipFormatter={(ms: number) => `${ms / 1000}s`}
        debounce={500}
      />

      <Info
        message={$t('Looking for the old AlertBox settings?')}
        onClick={switchToLegacyAlertbox}
      />
      {/* TODO: check this feature is working for prime and non-prime users */}
      {/*<Info*/}
      {/*  message={$t('Need to test your alerts with different scenarios?')}*/}
      {/*  onClick={openAdvancedAlertTesting}*/}
      {/*/>*/}
      <AdvancedSettingsPanel />
    </Form>
  );
}

/**
 * List of alerts with "Play Alert" buttons
 */
function AlertsList() {
  const {
    onMenuClickHandler,
    alerts,
    selectedTab,
    playAlert,
    setEnabled,
    enabledAlerts,
    openAlertInfo,
  } = useAlertBox();

  return (
    <Menu onClick={onMenuClickHandler} selectedKeys={[selectedTab]} theme={'dark'}>
      {alerts.map(alertEvent => (
        <Menu.Item key={alertEvent.type}>
          {/* ON/OF CHECKBOX */}
          <CheckboxInput
            value={enabledAlerts.includes(alertEvent.type)}
            onChange={val => setEnabled(alertEvent.type, val)}
            style={{ display: 'inline-block' }}
          />

          {/* NAME AND TOOLTIP */}
          {alertEvent.name}
          {alertEvent.tooltip && (
            <Tooltip
              placement="rightBottom"
              title={
                <span>
                  {alertEvent.tooltip}
                  {alertEvent.tooltipLink && (
                    <ButtonGroup>
                      <Button type="link" onClick={() => openAlertInfo(alertEvent.type)}>
                        {$t('More Info')}
                      </Button>
                    </ButtonGroup>
                  )}
                </span>
              }
            >
              <QuestionCircleOutlined style={{ marginLeft: '7px' }} />
            </Tooltip>
          )}

          {/* "PLAY ALERT" BUTTON */}
          <Tooltip title={$t('Play Alert')} placement="left">
            <Button
              onClick={e => {
                e.stopPropagation();
                playAlert(alertEvent.type);
              }}
              type={'text'}
              style={{ position: 'absolute', right: '16px', top: '8px' }}
              icon={<CaretRightOutlined style={{ fontSize: '36px', color: 'white' }} />}
            />
          </Tooltip>
        </Menu.Item>
      ))}
    </Menu>
  );
}

/**
 * Settings for a selected Alert
 */
function VariationSettings(p: { type: TAlertType }) {
  let SettingsComponent: JSX.Element;
  switch (p.type) {
    case 'donation':
      SettingsComponent = <DonationSettings />;
      break;
    case 'merch':
      SettingsComponent = <MerchSettings />;
      break;
    default:
      SettingsComponent = <CommonAlertSettings type={p.type} />;
      break;
  }

  return (
    <>
      {SettingsComponent}
      <AnimationSettingsPanel />
      <FontSettingsPanel />
    </>
  );
}

/**
 * Common settings for a selected Alert
 */
function CommonAlertSettings(p: { type: TAlertType; hiddenFields?: string[] }) {
  const { createVariationBinding, isCustomCodeEnabled, selectedTab } = useAlertBox();
  const bind = createVariationBinding(p.type, 'default', useForceUpdate(), p.hiddenFields);
  const containerRef = useRef<HTMLDivElement>(null);
  const bindMinAmount =
    // TODO: index
    // @ts-ignore
    bind['alert_message_min_amount'].value !== undefined ? bind['alert_message_min_amount'] : null;

  return (
    <div key={selectedTab} ref={containerRef}>
      <MediaUrlInput {...bind.image_href} />
      {!isCustomCodeEnabled && <LayoutInput {...bind.layout} />}
      <AudioUrlInput {...bind.sound_href} />
      <SliderInput debounce={500} {...bind.sound_volume} />
      <TextInput {...bind.message_template} />
      {isCustomCodeEnabled && <SliderInput {...bind.alert_duration} />}
      {bindMinAmount && <NumberInput {...bindMinAmount} />}
    </div>
  );
}

/**
 * Renders FontSettings panel for a selected variation
 */
function FontSettingsPanel() {
  const { createVariationBinding, selectedAlert, isCustomCodeEnabled } = useAlertBox();
  assertIsDefined(selectedAlert);
  const bind = createVariationBinding(selectedAlert, 'default', useForceUpdate());

  // do not show font settings if CustomCode is enabled
  if (isCustomCodeEnabled) return <></>;

  return (
    <>
      <Collapse bordered={false}>
        <Collapse.Panel header={$t('Font Settings')} key={1}>
          <FontFamilyInput {...bind.font} />
          <FontSizeInput {...bind.font_size} />
          <FontWeightInput {...bind.font_weight} />
          <ColorInput {...bind.font_color} />
          <ColorInput {...bind.font_color2} />
        </Collapse.Panel>
      </Collapse>
    </>
  );
}

/**
 * Renders AnimationsSetting panel for a selected variation
 */
function AnimationSettingsPanel() {
  const {
    createVariationBinding,
    selectedAlert,
    isCustomCodeEnabled,
    animationOptions,
  } = useAlertBox();
  assertIsDefined(selectedAlert);
  const bind = createVariationBinding(selectedAlert, 'default', useForceUpdate());

  // do not show animations if CustomCode is enabled
  if (isCustomCodeEnabled) return <></>;

  return (
    <>
      <Collapse bordered={false}>
        <Collapse.Panel header={$t('Animations')} key={1}>
          <SliderInput {...bind.alert_duration} />
          <ListInput {...bind.show_animation} options={animationOptions.show} />
          <ListInput {...bind.hide_animation} options={animationOptions.hide} />
          <SliderInput {...bind.text_delay} />
          <ListInput {...bind.text_animation} options={animationOptions.text} />
        </Collapse.Panel>
      </Collapse>
    </>
  );
}

/**
 * Additional settings for donation alerts
 */
function DonationSettings() {
  const { createVariationBinding } = useAlertBox();
  const bind = createVariationBinding('donation', 'default', useForceUpdate());
  const { HostsService, UsageStatisticsService, MagicLinkService } = Services;
  const host = HostsService.streamlabs;

  function openDonationSettings() {
    MagicLinkService.actions.openDonationSettings();
  }

  function openTipPageSettings() {
    remote.shell.openExternal(`https://${host}/editor?ref=slobs`);
    UsageStatisticsService.actions.recordFeatureUsage('openDonationSettings');
  }

  return (
    <>
      <CommonAlertSettings type="donation" />

      <Info message={$t('Need to set up tipping?')} onClick={openDonationSettings} />
      <Info
        message={$t('Customize your tip page where viewers can send you donations')}
        onClick={openTipPageSettings}
      />
    </>
  );
}

/**
 * Additional settings for merch
 */
function MerchSettings() {
  const { createVariationBinding } = useAlertBox();
  const bind = createVariationBinding('merch', 'default', useForceUpdate());
  const hiddenFields = bind.use_custom_image.value ? [] : ['image_href'];

  return (
    <>
      <InputWrapper>
        <CheckboxInput {...bind.use_custom_image} />
      </InputWrapper>
      <CommonAlertSettings type="merch" hiddenFields={hiddenFields} />
    </>
  );
}

/**
 * A shortcut for Alert.info from antd lib
 */
function Info(p: { message: string; onClick: Function }) {
  return (
    <Alert
      message={
        <span>
          {p.message}
          <a onClick={() => p.onClick()}> {$t('Click here')}</a>
        </span>
      }
      type="info"
      showIcon
      style={{ marginBottom: '16px' }}
    />
  );
}

/**
 * Advanced panel in the General Settings tab
 */
function AdvancedSettingsPanel() {
  const { bind, updateSettings } = useAlertBox();
  const isUnlimitedModerationDelay = bind.moderation_delay.value === -1;

  function switchUnlimitedModeration(enabled: boolean) {
    updateSettings({ moderation_delay: enabled ? -1 : 0 });
  }

  return (
    <Collapse bordered={false} style={{ marginBottom: '8px' }}>
      <Collapse.Panel header={$t('Advanced')} key={1}>
        <SwitchInput {...bind.interrupt_mode} />
        {bind.interrupt_mode.value && <SliderInput {...bind.interrupt_mode_delay} debounce={500} />}
        <InputWrapper label={$t('Alert Moderation delay')}>
          {!isUnlimitedModerationDelay && (
            <SliderInput {...bind.moderation_delay} min={0} debounce={500} nowrap />
          )}
          <CheckboxInput
            label={$t('Use unlimited delay')}
            value={isUnlimitedModerationDelay}
            onChange={switchUnlimitedModeration}
            tooltip={$t(
              'This applies to all alerts. If enabled all alerts need to be approved manually.',
            )}
          />
        </InputWrapper>
      </Collapse.Panel>
    </Collapse>
  );
}
