import * as remote from '@electron/remote';
import { Tooltip } from 'antd';
import cx from 'classnames';
import { alertAsync } from 'components-react/modals';
import { AuthModal } from 'components-react/shared/AuthModal';
import DualOutputControls from 'components-react/shared/DualOutputControls';
import { SwitchInput } from 'components-react/shared/inputs';
import MenuItem from 'components-react/shared/MenuItem';
import throttle from 'lodash/throttle';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { $t } from 'services/i18n';
import { ESettingsCategory } from 'services/settings';
import { $i } from 'services/utils';
import { useVuex } from '../hooks';
import { Services } from '../service-provider';
import styles from './ToolsNav.m.less';
import PlatformIndicator from './PlatformIndicator';
import HelpTip from 'components-react/shared/HelpTip';
import { EDismissable } from 'services/dismissables';
import { platformLabels } from 'services/platforms';

/**
 * Returns tools nav items (fragment), any modals that must live outside the
 * <Menu> element, and a `contentKey` that changes whenever the fragment's
 * rendered width could change (see useNavCollapse). Called as a hook from
 * NavMenu so that rc-menu's overflow measurement sees individual items rather
 * than an opaque component.
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
    MagicLinkService,
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
  const profileRef = useRef<HTMLDivElement>(null);

  // Style blockers hide the native display/chat surfaces so the log-out confirm
  // modal can paint above them. Clearing is debounced by antd's 300ms fade so
  // the native surface doesn't paint over the modal mid-fade.
  const clearBlockersTimeout = useRef<number>();
  useEffect(() => {
    if (showModal) {
      window.clearTimeout(clearBlockersTimeout.current);
      updateStyleBlockers('main', true);
      return;
    }
    clearBlockersTimeout.current = window.setTimeout(() => {
      updateStyleBlockers('main', false);
    }, 300);
    return () => window.clearTimeout(clearBlockersTimeout.current);
  }, [showModal]);

  useEffect(
    () => () => {
      // Don't leave style blockers engaged if this unmounts while open.
      // The block above will clear the timers.
      updateStyleBlockers('main', false);
    },
    [],
  );

  function openSettingsWindow() {
    SettingsService.actions.showSettings();
  }

  function openHelp() {
    UsageStatisticsService.actions.recordClick('NavMenu', 'help');
    SettingsService.actions.showSettings(ESettingsCategory.GetSupport);
  }

  const openDashboard = useMemo(
    () =>
      throttle(
        async () => {
          UsageStatisticsService.actions.recordClick('NavMenu', 'dashboard');
          try {
            const link = await MagicLinkService.getDashboardMagicLink();
            remote.shell.openExternal(link);
          } catch (e: unknown) {
            console.error('Error generating dashboard magic link', e);
          }
        },
        2000,
        { trailing: false },
      ),
    [],
  );

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
        // NOTE: setDualOutputModeIfPossible reloads the UI, so we can't run
        // TransitionsService.actions.toggleStudioMode() afterwards.
        onOk: () => DualOutputService.actions.return.setDualOutputModeIfPossible(false, true),
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

      {isLoggedIn && (
        <MenuItem
          title={$t('Dashboard')}
          icon={<i className="icon-dashboard" />}
          onClick={() => openDashboard()}
          className={cx(styles.compact, styles.iconOnly)}
          wrapperClassName={styles.toolsNav}
        />
      )}

      <MenuItem
        title={$t('Get Help')}
        icon={<i className="icon-question" />}
        onClick={openHelp}
        className={cx(styles.compact, styles.iconOnly)}
        wrapperClassName={styles.toolsNav}
      />

      <MenuItem
        title={$t('Settings')}
        icon={<i className="icon-settings" />}
        onClick={openSettingsWindow}
        className={cx(styles.compact, styles.iconOnly)}
        wrapperClassName={styles.toolsNav}
      />

      <MenuItem
        data-testid="nav-auth"
        wrapperClassName={styles.toolsNav}
        onClick={() => (isLoggedIn ? setShowModal(true) : handleAuth())}
      >
        <div ref={profileRef} className={styles.userProfileAnchor}>
          <Tooltip
            title={
              <div className={styles.userProfileTooltip}>
                {isLoggedIn ? (
                  <PlatformIndicator platform={platform} displayName={displayName} />
                ) : (
                  $t('Log In')
                )}
              </div>
            }
            placement="left"
            arrowPointAtCenter
            getPopupContainer={() => profileRef.current as HTMLElement}
          >
            <div className={styles.userProfile}>
              <img className={styles.userProfileImage} src={$i('images/user.png')} />
            </div>
          </Tooltip>
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

  // Signature of everything that can change this fragment's rendered width,
  // for useNavCollapse to know when to re-measure.
  const contentKey = `${isLoggedIn}|${dualOutputMode}`;

  return { items, modals, contentKey };
}
