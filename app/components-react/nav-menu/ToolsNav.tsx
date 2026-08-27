import * as remote from '@electron/remote';
import { Dropdown } from 'antd';
import cx from 'classnames';
import { alertAsync } from 'components-react/modals';
import { AuthModal } from 'components-react/shared/AuthModal';
import DualOutputControls from 'components-react/shared/DualOutputControls';
import { SwitchInput } from 'components-react/shared/inputs';
import MenuItem from 'components-react/shared/MenuItem';
import electron from 'electron';
import throttle from 'lodash/throttle';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NotificationsBell } from 'components-react/root/NotificationsArea';
import { $t } from 'services/i18n';
import { ESettingsCategory } from 'services/settings';
import Utils, { $i } from 'services/utils';
import { useVuex } from '../hooks';
import { Services } from '../service-provider';
import styles from './ToolsNav.m.less';
import PlatformIndicator from './PlatformIndicator';
import HelpTip from 'components-react/shared/HelpTip';
import { EDismissable } from 'services/dismissables';
import { platformLabels } from 'services/platforms';

/**
 * Returns tools nav items (fragment) and any modals that must live outside
 * the <Menu> element. Called as a hook from NavMenu so that rc-menu's overflow
 * measurement sees individual items rather than an opaque component.
 */
export function useToolsNav() {
  const {
    UserService,
    SettingsService,
    UsageStatisticsService,
    WindowsService,
    TransitionsService,
    DualOutputService,
    StreamingService,
  } = Services;

  const {
    isLoggedIn,
    username,
    dualOutputMode,
    studioMode,
    platform,
    updateStyleBlockers,
    isRecording,
  } = useVuex(
    () => ({
      isLoggedIn: UserService.views.isLoggedIn,
      username: UserService.views.username,
      dualOutputMode: Services.DualOutputService.views.dualOutputMode,
      studioMode: TransitionsService.views.studioMode,
      platform: UserService.views.auth?.platforms[UserService.views.auth?.primaryPlatform],
      updateStyleBlockers: WindowsService.actions.updateStyleBlockers,
      isRecording: StreamingService.views.isRecording,
    }),
    false,
  );

  /**
   * The user display name.
   *
   * @note Some platforms (e.g. Instagram) don't provide a username.
   * Use the platform name instead.
   */
  const displayName = useMemo(() => {
    if (!isLoggedIn) return $t('Log In');
    if (username) return username;
    if (platform) return $t('%{platform} User', { platform: platformLabels(platform.type) });
    return $t('Logged In');
  }, [isLoggedIn, platform, username]);

  const [showModal, setShowModal] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // Style blockers hide the native display/chat surfaces so this DOM popup can
  // paint above them (see ToolsNav.tsx's callers in the top-nav migration plan).
  // Driven from one effect so the profile dropdown and the log-out confirm modal
  // can't race each other turning blockers off while the other is still open.
  //
  // The dropdown fades out over antd's animation (300ms) - clearing immediately
  // would let the native surface paint over the popup mid-fade. So closing is
  // debounced by that duration; opening (or re-opening while the timer is
  // pending) is immediate.
  const clearBlockersTimeout = useRef<number>();
  useEffect(() => {
    if (profileOpen || showModal) {
      window.clearTimeout(clearBlockersTimeout.current);
      updateStyleBlockers('main', true);
      return;
    }
    clearBlockersTimeout.current = window.setTimeout(() => {
      updateStyleBlockers('main', false);
    }, 300);
    return () => window.clearTimeout(clearBlockersTimeout.current);
  }, [profileOpen, showModal]);

  const isMounted = useRef(true);
  useEffect(
    () => () => {
      isMounted.current = false;

      // Don't leave style blockers engaged if this unmounts while open.
      // The block above will clear the timers.
      updateStyleBlockers('main', false);
    },
    [],
  );

  function openSettingsWindow() {
    SettingsService.actions.showSettings();
  }

  const handleAuth = () => {
    if (isLoggedIn) {
      DualOutputService.actions.setDualOutputModeIfPossible(false, true);
      UserService.actions.logOut();
    } else {
      WindowsService.actions.closeChildWindow();
      UserService.actions.showLogin();
    }
  };

  const toggleStudioMode = useCallback(() => {
    UsageStatisticsService.actions.recordClick('ToolsNav', 'studio-mode');

    if (DualOutputService.views.dualOutputMode || DualOutputService.views.showBothDisplays) {
      alertAsync({
        type: 'confirm',
        title: $t('Dual Output Enabled'),
        closable: true,
        content: (
          <span>
            {$t(
              'Cannot toggle Studio Mode while in Dual Output Mode. Please disable Dual Output to use Studio Mode.',
            )}
          </span>
        ),
        cancelText: $t('Close'),
        okText: $t('Disable'),
        okButtonProps: { type: 'primary' },
        onOk: async () => {
          DualOutputService.actions.setDualOutputModeIfPossible(false, true);
          // TODO @nav: setDualOutputModeIfPossible reloads the UI, so this never happens.
          // Figure out how to wire this up to finish the toggle after the reload afterwards.
          // TransitionsService.actions.toggleStudioMode();
        },
        cancelButtonProps: { style: { display: 'inline' } },
      });
      return;
    }

    TransitionsService.actions.toggleStudioMode();
  }, []);

  const items = (
    <>
      <MenuItem
        title={$t('Dual Output')}
        icon={!dualOutputMode && <i className="icon-dual-output" />}
        wrapperClassName={cx(styles.toolsNav, styles.toolsStart)}
      >
        <DualOutputControls
          source="NavMenu"
          type="switch"
          isRecording={isRecording}
          tooltipDisabled
        />
      </MenuItem>

      <MenuItem
        title={$t('Studio Mode')}
        wrapperClassName={styles.toolsNav}
        icon={
          // Both e2e selectors and the mutual-exclusion tests target this glyph,
          // so it stays even though the switch is now the primary control. It
          // gets its own onClick (rather than one on the MenuItem) so clicking
          // it doesn't also bubble into the switch's onChange and cancel out.
          <i
            className={cx('icon-studio-mode-3', studioMode && styles.toggleActive)}
            onClick={toggleStudioMode}
          />
        }
      >
        <SwitchInput
          value={studioMode}
          onChange={toggleStudioMode}
          name="studio-mode-toggle"
          label={$t('Studio Mode')}
          layout="horizontal"
          labelAlign="left"
          nomargin
          skipWrapperAttrs
          className={cx(styles.toggle, studioMode && styles.toggleActive)}
        />
      </MenuItem>

      <MenuItem wrapperClassName={cx(styles.toolsNav, styles.divider)}>
        <hr />
      </MenuItem>

      <MenuItem
        title={$t('Settings')}
        icon={<i className="icon-settings" />}
        onClick={openSettingsWindow}
        className={cx(styles.compact, styles.settingsMenu)}
        wrapperClassName={styles.toolsNav}
      />

      <MenuItem
        title={$t('Notifications')}
        className={cx(styles.compact)}
        wrapperClassName={styles.toolsNav}
      >
        <NotificationsBell />
      </MenuItem>

      <MenuItem
        title={isLoggedIn ? displayName : $t('Log In')}
        className={cx(styles.compact)}
        wrapperClassName={styles.toolsNav}
      >
        <div ref={profileRef} className={styles.userProfileAnchor}>
          <Dropdown
            overlay={
              <UserProfileOverlay
                isLoggedIn={isLoggedIn}
                platform={platform}
                displayName={displayName}
                isMounted={isMounted}
                setProfileOpen={setProfileOpen}
                setShowModal={setShowModal}
                handleAuth={handleAuth}
              />
            }
            trigger={['click']}
            visible={profileOpen}
            onVisibleChange={setProfileOpen}
            getPopupContainer={() => profileRef.current as HTMLElement}
            placement="bottomRight"
            align={{ offset: [0, 0] }}
          >
            <div className={styles.userProfile}>
              <img className={styles.userProfileImage} src={$i('images/user.png')} />
              <i className={cx('icon-dropdown', styles.userProfileDropdownIcon)} />
            </div>
          </Dropdown>
        </div>
      </MenuItem>
    </>
  );

  const modals = (
    <>
      <AuthModal
        title={$t('Confirm')}
        prompt={$t('Are you sure you want to log out %{username}?', { username: displayName })}
        showModal={showModal}
        handleAuth={handleAuth}
        handleShowModal={setShowModal}
      />
      <HelpTip
        title={$t('Login')}
        dismissableKey={EDismissable.LoginPrompt}
        position={{ top: '46px', right: '8px' }}
        tipPosition="right"
        arrowPosition="top"
        style={{ position: 'absolute' }}
      >
        <div>
          {$t(
            'Gain access to additional features by logging in with your preferred streaming platform.',
          )}
        </div>
      </HelpTip>
    </>
  );

  return { items, modals };
}

function UserProfileOverlay(p: {
  isLoggedIn: boolean;
  platform?: any;
  displayName: string;
  isMounted: React.MutableRefObject<boolean>;
  setProfileOpen: (open: boolean) => void;
  setShowModal: (show: boolean) => void;
  handleAuth: () => void;
}) {
  const { SettingsService, MagicLinkService, UsageStatisticsService } = Services;

  const {
    isLoggedIn,
    platform,
    displayName,
    isMounted,
    setProfileOpen,
    setShowModal,
    handleAuth,
  } = p;

  const [dashboardOpening, setDashboardOpening] = useState(false);
  const isDevMode = useMemo(() => Utils.isDevMode(), []);

  const openDashboard = throttle(
    async (page?: string) => {
      UsageStatisticsService.actions.recordClick('NavMenu', page || 'dashboard');
      if (dashboardOpening) return;
      setDashboardOpening(true);

      try {
        const link = await MagicLinkService.getDashboardMagicLink(page);
        remote.shell.openExternal(link);
      } catch (e: unknown) {
        console.error('Error generating dashboard magic link', e);
      }

      if (isMounted.current) setDashboardOpening(false);
    },
    2000,
    { trailing: false },
  );

  return (
    <div className={cx(styles.userProfileMenu, 'react')}>
      {isLoggedIn && (
        <>
          <div className={styles.userProfileHeader}>
            <PlatformIndicator platform={platform} displayName={displayName} />
          </div>
          <div
            className={styles.userProfileItem}
            onClick={() => {
              setProfileOpen(false);
              openDashboard();
            }}
          >
            {$t('Dashboard')}
          </div>
        </>
      )}

      {isDevMode && (
        <div
          className={styles.userProfileItem}
          onClick={() => {
            setProfileOpen(false);
            electron.ipcRenderer.send('openDevTools');
          }}
        >
          {$t('Dev Tools')}
        </div>
      )}

      <div
        className={styles.userProfileItem}
        onClick={() => {
          setProfileOpen(false);
          UsageStatisticsService.actions.recordClick('NavMenu', 'help');
          SettingsService.actions.showSettings(ESettingsCategory.GetSupport);
        }}
      >
        {$t('Get Help')}
      </div>

      <div
        className={styles.userProfileItem}
        data-testid="nav-auth"
        onClick={() => {
          setProfileOpen(false);
          if (isLoggedIn) {
            setShowModal(true);
          } else {
            handleAuth();
          }
        }}
      >
        {isLoggedIn ? $t('Log Out') : $t('Log In')}
      </div>
    </div>
  );
}
