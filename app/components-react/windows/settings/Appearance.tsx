import { Col, Row } from 'antd';
import { useVuex } from 'components-react/hooks';
import { useRealmObject } from 'components-react/hooks/realm';
import { bindFormState } from 'components-react/shared/inputs';
import UltraIcon from 'components-react/shared/UltraIcon';
import React, { useMemo } from 'react';
import { CustomizationState } from 'services/customization';
import { $t } from 'services/i18n';
import { getDefined } from '../../../util/properties-type-guards';
import { Services } from '../../service-provider';
import { CheckboxInput, ListInput, SliderInput, SwitchInput } from '../../shared/inputs';
import styles from './Appearance.m.less';
import { ObsSettingsSection } from './ObsSettings';

export function AppearanceSettings() {
  const {
    CustomizationService,
    WindowsService,
    UserService,
    MagicLinkService,
    NavMenuService,
  } = Services;

  // Hooks up reactivity for Customization state
  useRealmObject(CustomizationService.state);

  const bind = bindFormState(
    () => CustomizationService.state.toObject() as CustomizationState,
    (newSettings: CustomizationState) => CustomizationService.setSettings(newSettings as any),
  );

  const { menuItemStatus, isLoggedIn, isPrime, toggleMenuItem } = useVuex(() => ({
    menuItemStatus: NavMenuService.views.menuItemStatus,
    isLoggedIn: UserService.views.isLoggedIn,
    isPrime: UserService.views.isPrime,
    toggleMenuItem: NavMenuService.actions.toggleMenuItem,
  }));

  function openFFZSettings() {
    WindowsService.actions.createOneOffWindow(
      {
        componentName: 'FFZSettings',
        title: $t('FrankerFaceZ Settings'),
        queryParams: {},
        size: {
          width: 800,
          height: 800,
        },
      },
      'ffz-settings',
    );
  }

  async function upgradeToPrime() {
    MagicLinkService.actions.linkToPrime('slobs-ui-themes');
  }

  const shouldShowPrime = isLoggedIn && !isPrime;
  const shouldShowEmoteSettings = isLoggedIn && getDefined(UserService.platform).type === 'twitch';
  const activeMenuItems = useMemo(() => NavMenuService.activeMenuItems, [isLoggedIn, isPrime]);

  return (
    <div className={styles.container}>
      <ObsSettingsSection>
        <ListInput {...bind.theme} label={'Theme'} options={CustomizationService.themeOptions} />
        {shouldShowPrime && (
          <div style={{ marginBottom: '16px' }}>
            <a onClick={upgradeToPrime}>
              <UltraIcon
                type={CustomizationService.isDarkTheme ? 'night' : 'day'}
                style={{
                  display: 'inline-block',
                  height: '12px',
                  width: '12px',
                  marginRight: '5px',
                }}
              />
              {$t('Change the look of Streamlabs Desktop with Ultra')}
            </a>
          </div>
        )}
      </ObsSettingsSection>

      <ObsSettingsSection title={$t('Chat Settings')}>
        <CheckboxInput
          {...bind.leftDock}
          label={$t('Show the live dock (chat) on the left side')}
        />
        <SliderInput
          {...bind.chatZoomFactor}
          label={$t('Text Size')}
          tipFormatter={(val: number) => `${val * 100}%`}
          min={0.25}
          max={2}
          step={0.25}
        />

        {shouldShowEmoteSettings && (
          <div>
            <CheckboxInput
              {...bind.enableBTTVEmotes}
              label={$t('Enable BetterTTV emotes for Twitch')}
            />
            <CheckboxInput
              {...bind.enableFFZEmotes}
              label={$t('Enable FrankerFaceZ emotes for Twitch')}
            />
          </div>
        )}
      </ObsSettingsSection>

      <ObsSettingsSection title={$t('Custom Navigation Bar')}>
        {/* Main nav item show/hide toggles */}
        <Row className={styles.navMenuSettings}>
          <Col flex={1} className={styles.menuControls}>
            {activeMenuItems.map(({ key, title }) => (
              <SwitchInput
                key={key}
                label={title}
                layout="horizontal"
                onChange={() => toggleMenuItem(key)}
                value={menuItemStatus[key]}
                disabled={!isLoggedIn}
              />
            ))}
          </Col>
        </Row>
      </ObsSettingsSection>

      <ObsSettingsSection>
        <CheckboxInput
          {...bind.enableAnnouncements}
          label={$t('Show announcements for new Streamlabs features and products')}
          className={styles.extraMargin}
        />
      </ObsSettingsSection>

      <ObsSettingsSection className={styles.extraMargin}>
        <ListInput
          {...bind.folderSelection}
          label={$t('Scene item selection mode')}
          options={[
            { value: true, label: $t('Single click selects group. Double click selects item') },
            {
              value: false,
              label: $t('Double click selects group. Single click selects item'),
            },
          ]}
        />
      </ObsSettingsSection>

      {bind.enableFFZEmotes.value && (
        <div className="section">
          <button className="button button--action" onClick={openFFZSettings}>
            {$t('Open FrankerFaceZ Settings')}
          </button>
        </div>
      )}
    </div>
  );
}
