import React from 'react';
import { Services } from '../../service-provider';
import { $t } from '../../../services/i18n';
import { Row, Col, Select } from 'antd';
import { CheckboxInput, ListInput, SliderInput, SwitchInput } from '../../shared/inputs';
import { getDefined } from '../../../util/properties-type-guards';
import { ObsSettingsSection } from './ObsSettings';
import { ENavName, EMenuItemKey, IAppMenuItem, menuTitles } from 'services/side-nav';
import { useVuex } from 'components-react/hooks';
import styles from './Appearance.m.less';
import cx from 'classnames';
import { EAppPageSlot } from 'services/platform-apps';
import Scrollable from 'components-react/shared/Scrollable';
import UltraIcon from 'components-react/shared/UltraIcon';
import { CustomizationState } from 'services/customization';
import { useRealmObject } from 'components-react/hooks/realm';
import { bindFormState } from 'components-react/shared/inputs';

const { Option } = Select;

export function AppearanceSettings() {
  const {
    CustomizationService,
    WindowsService,
    UserService,
    MagicLinkService,
    SideNavService,
    PlatformAppsService,
    LayoutService,
  } = Services;

  // Hooks up reactivity for Customization state
  useRealmObject(CustomizationService.state);

  const bind = bindFormState(
    () => CustomizationService.state.toObject() as CustomizationState,
    (newSettings: CustomizationState) => CustomizationService.setSettings(newSettings as any),
  );

  const {
    compactView,
    menuItemStatus,
    apps,
    displayedApps,
    showCustomEditor,
    isLoggedIn,
    isPrime,
    currentTab,
    toggleApp,
    replaceApp,
    toggleSidebarSubMenu,
    toggleMenuItem,
    setCompactView,
  } = useVuex(() => ({
    compactView: SideNavService.views.compactView,
    menuItemStatus: SideNavService.views.menuItemStatus,
    apps: PlatformAppsService.views.enabledApps.filter(app => {
      return !!app?.manifest?.pages.find(page => {
        return page.slot === EAppPageSlot.TopNav;
      });
    }),
    displayedApps: SideNavService.views.apps,
    showCustomEditor: SideNavService.views.showCustomEditor,
    isLoggedIn: UserService.views.isLoggedIn,
    isPrime: UserService.views.isPrime,
    currentTab: LayoutService.state.currentTab,
    toggleApp: SideNavService.actions.toggleApp,
    replaceApp: SideNavService.actions.replaceApp,
    toggleSidebarSubMenu: SideNavService.actions.toggleSidebarSubmenu,
    toggleMenuItem: SideNavService.actions.toggleMenuItem,
    setCompactView: SideNavService.actions.setCompactView,
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

  /**
   * Sort apps
   */

  const displayedAppsStatus = displayedApps.reduce((hashmap, app) => {
    return app ? { ...hashmap, [app.id]: app.isActive } : hashmap;
  }, {});

  const allEnabledApps = apps
    .reduce(
      (enabledApps: { id: string; name?: string; icon?: string; isActive: boolean }[], app) => {
        if (app) {
          enabledApps.push({
            id: app.id,
            name: app.manifest?.name,
            icon: app.manifest?.icon,
            // TODO: index
            // @ts-ignore
            isActive: displayedAppsStatus[app.id] ?? false,
          });
        }
        return enabledApps;
      },
      [],
    )
    .sort();

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
        <CheckboxInput
          onChange={value => setCompactView(!value)}
          label={$t(
            'Enable custom navigation bar to pin your favorite features for quick access.\nDisable to swap to compact view.',
          )}
          value={!compactView}
          className={cx(styles.settingsCheckbox)}
          disabled={!isLoggedIn}
        />
        {/* SIDENAV SETTINGS */}
        <Row className={styles.sidenavSettings}>
          <Col flex={1} className={styles.menuControls}>
            <SwitchInput
              label={menuTitles(EMenuItemKey.Editor)}
              layout="horizontal"
              onChange={() => toggleMenuItem(ENavName.TopNav, EMenuItemKey.Editor)}
              value={
                // TODO: index
                // @ts-ignore
                menuItemStatus[EMenuItemKey.Editor]
              }
              disabled={!isLoggedIn || compactView || currentTab === 'default'}
            />
            <SwitchInput
              label={$t('Custom Editor')}
              layout="horizontal"
              onChange={() => toggleSidebarSubMenu()}
              value={isLoggedIn && showCustomEditor}
              disabled={
                !isLoggedIn || compactView || (currentTab !== 'default' && showCustomEditor)
              }
            />
            <SwitchInput
              label={menuTitles(EMenuItemKey.StudioMode)}
              layout="horizontal"
              onChange={() => toggleMenuItem(ENavName.TopNav, EMenuItemKey.StudioMode)}
              value={
                // TODO: index
                // @ts-ignore
                menuItemStatus[EMenuItemKey.StudioMode]
              }
              disabled={!isLoggedIn || compactView}
            />
            <SwitchInput
              label={menuTitles(EMenuItemKey.LayoutEditor)}
              layout="horizontal"
              onChange={() => toggleMenuItem(ENavName.TopNav, EMenuItemKey.LayoutEditor)}
              value={
                // TODO: index
                // @ts-ignore
                menuItemStatus[EMenuItemKey.LayoutEditor]
              }
              disabled={!isLoggedIn || compactView}
            />
            <SwitchInput
              label={menuTitles(EMenuItemKey.Themes)}
              layout="horizontal"
              onChange={() => toggleMenuItem(ENavName.TopNav, EMenuItemKey.Themes)}
              value={
                // TODO: index
                // @ts-ignore
                menuItemStatus[EMenuItemKey.Themes]
              }
              disabled={!isLoggedIn || compactView}
            />
            <SwitchInput
              label={menuTitles(EMenuItemKey.Highlighter)}
              layout="horizontal"
              onChange={() => toggleMenuItem(ENavName.TopNav, EMenuItemKey.Highlighter)}
              value={
                // TODO:
                // @ts-ignore
                menuItemStatus[EMenuItemKey.Highlighter]
              }
              disabled={!isLoggedIn || compactView}
            />
            <SwitchInput
              label={menuTitles(EMenuItemKey.RecordingHistory)}
              layout="horizontal"
              onChange={() => toggleMenuItem(ENavName.TopNav, EMenuItemKey.RecordingHistory)}
              value={
                // TODO:
                // @ts-ignore
                menuItemStatus[EMenuItemKey.RecordingHistory]
              }
              disabled={!isLoggedIn || compactView}
            />
          </Col>

          {/* SIDENAV APPS SETTINGS */}
          <Col flex={5}>
            <Scrollable style={{ height: '100%', right: '5px' }} snapToWindowEdge>
              <SwitchInput
                label={menuTitles(EMenuItemKey.AppStore)}
                layout="horizontal"
                onChange={() => toggleMenuItem(ENavName.TopNav, EMenuItemKey.AppStore)}
                value={
                  // TODO:
                  // @ts-ignore
                  menuItemStatus[EMenuItemKey.AppStore]
                }
                disabled={!isLoggedIn || compactView}
              />

              {displayedApps.map((app: IAppMenuItem | undefined, index: number) => (
                <Row key={`app-${index + 1}`} className={styles.appsSelector}>
                  <SwitchInput
                    label={`${$t('App')} ${index + 1}`}
                    layout="horizontal"
                    onChange={() => app?.id && toggleApp(app.id)}
                    value={app && app?.isActive}
                    disabled={!isLoggedIn || index + 1 > apps.length || compactView}
                  />

                  {/* dropdown options for apps */}
                  <Select
                    defaultValue={app?.name ?? ''}
                    className={styles.appsDropdown}
                    onChange={value => {
                      const selectedApp = allEnabledApps.find(selected => selected?.name === value);
                      selectedApp && replaceApp(selectedApp, index);
                    }}
                    value={app?.name ?? ''}
                    disabled={!isLoggedIn || index + 1 > apps.length}
                  >
                    {allEnabledApps.map(enabledApp => (
                      <Option key={enabledApp?.id} value={enabledApp?.name || ''}>
                        {enabledApp?.name}
                      </Option>
                    ))}
                  </Select>
                </Row>
              ))}
            </Scrollable>
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

AppearanceSettings.page = 'Appearance';
