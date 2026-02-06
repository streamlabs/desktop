import React, { useRef, useMemo, MouseEvent } from 'react';
import { getPlatformService, platformLabels, TPlatform } from '../../../services/platforms';
import cx from 'classnames';
import { $t } from '../../../services/i18n';
import styles from './DestinationSwitchers.m.less';
import { ICustomStreamDestination } from '../../../services/settings/streaming';
import { Services } from '../../service-provider';
import { SwitchInput } from '../../shared/inputs';
import PlatformLogo from '../../shared/PlatformLogo';
import { useDebounce } from '../../hooks';
import { useGoLiveSettings } from './useGoLiveSettings';
import DisplaySelector from 'components-react/shared/DisplaySelector';
import ConnectButton from 'components-react/shared/ConnectButton';
import { message, Tooltip } from 'antd';

/**
 * Allows enabling/disabling platforms and custom destinations for the stream
 */
export function DestinationSwitchers(p: { disabled?: boolean }) {
  const {
    linkedPlatforms,
    enabledPlatforms,
    customDestinations,
    enabledDestinations,
    switchPlatforms,
    switchCustomDestination,
    isPlatformLinked,
    isPrimaryPlatform,
    isRestreamEnabled,
    isDualOutputMode,
    isPrime,
    alwaysEnabledPlatforms,
    alwaysShownPlatforms,
    isTwitchDualStreaming,
    activeDisplayPlatforms,
    isUpdateMode,
  } = useGoLiveSettings();

  // use these references to apply debounce
  // for error handling and switch animation
  const enabledPlatformsRef = useRef(enabledPlatforms);
  enabledPlatformsRef.current = enabledPlatforms;
  const enabledDestRef = useRef(enabledDestinations);
  enabledDestRef.current = enabledDestinations;

  // some platforms are always shown, even if not linked
  // add them to the list of platforms to display
  const platforms = useMemo(() => {
    const unlinkedAlwaysShownPlatforms = alwaysShownPlatforms.filter(
      platform => !isPlatformLinked(platform),
    );
    return unlinkedAlwaysShownPlatforms.length
      ? linkedPlatforms.concat(unlinkedAlwaysShownPlatforms)
      : linkedPlatforms;
  }, [linkedPlatforms, enabledPlatformsRef.current, isDualOutputMode, isPrime]);

  // In single output mode, disable custom destination switchers when restream is not available
  // or for a non-ultra user. The one exception for a non-ultra user in single output mode
  // is if TikTok is the only enabled platform.
  const disableCustomDestinationSwitchers = useMemo(() => {
    if (p?.disabled) return true;

    return (
      !isRestreamEnabled &&
      !isDualOutputMode &&
      !isEnabled('tiktok') &&
      enabledPlatformsRef.current.length > 1
    );
  }, [isRestreamEnabled, isDualOutputMode, isPrime, enabledPlatformsRef.current]);

  // In dual output mode, non-ultra users can only enable 2 platforms,
  // or 1 platform and 1 custom destination.
  const disableNonUltraSwitchers = useMemo(() => {
    if (p?.disabled) return true;

    return (
      isDualOutputMode &&
      !isPrime &&
      enabledPlatformsRef.current.length + enabledDestRef.current.length >= 2
    );
  }, [isDualOutputMode, isPrime, enabledPlatformsRef.current, enabledDestRef.current]);

  // @@@ TODO: handle disabling the switcher in the edit stream window for the last enabled horizontal platform
  const disabledHorizontalUltraSwitcher = useMemo(() => {
    return isDualOutputMode &&
      isPrime &&
      isUpdateMode &&
      activeDisplayPlatforms.horizontal.length < 2
      ? activeDisplayPlatforms.horizontal[0]
      : null;
  }, [isDualOutputMode, isPrime, isUpdateMode, activeDisplayPlatforms]);

  // @@@ TODO: handle disabling the switcher in the edit stream window for the last enabled vertical platform
  const disabledVerticalUltraSwitcher = useMemo(() => {
    return isDualOutputMode && isPrime && isUpdateMode && activeDisplayPlatforms.vertical.length < 2
      ? activeDisplayPlatforms.vertical[0]
      : null;
  }, [isDualOutputMode, isPrime, isUpdateMode, activeDisplayPlatforms]);

  const disableNonTwitchSwitcher = isDualOutputMode && isTwitchDualStreaming; // In Twitch dual streaming mode, only allow Twitch to be enabled

  const emitSwitch = useDebounce(500, (ind?: number, enabled?: boolean) => {
    if (ind !== undefined && enabled !== undefined) {
      switchCustomDestination(ind, enabled);
    } else {
      switchPlatforms(enabledPlatformsRef.current);
    }
  });

  function isEnabled(target: TPlatform | number) {
    if (typeof target === 'number') {
      return enabledDestRef.current.includes(target);
    } else {
      return enabledPlatformsRef.current.includes(target);
    }
  }

  function togglePlatform(platform: TPlatform, enabled: boolean) {
    if (
      disabledHorizontalUltraSwitcher === platform ||
      disabledVerticalUltraSwitcher === platform
    ) {
      enabledPlatformsRef.current.push(platform);
      return;
    }
    // In dual output mode, only allow non-ultra users to have 2 platforms, or 1 platform and 1 custom destination enabled
    if (!isPrime) {
      if (isDualOutputMode) {
        if (enabledPlatformsRef.current.length + enabledDestRef.current.length <= 2) {
          enabledPlatformsRef.current.push(platform);
        } else {
          enabledPlatformsRef.current = enabledPlatformsRef.current.filter(p => p !== platform);
        }
      } else {
        if (enabled && alwaysEnabledPlatforms.includes(platform)) {
          enabledPlatformsRef.current.push(platform);
        } else if (enabled) {
          enabledPlatformsRef.current = enabledPlatformsRef.current.filter(p =>
            alwaysEnabledPlatforms.includes(p),
          );
          enabledPlatformsRef.current.push(platform);
        } else {
          enabledPlatformsRef.current = enabledPlatformsRef.current.filter(p => p !== platform);
        }
      }

      if (!enabledPlatformsRef.current.length) {
        enabledPlatformsRef.current.push(platform);
      }

      emitSwitch();
      return;
    }

    // user can always stream to tiktok in single output mode
    if (!isRestreamEnabled && !alwaysEnabledPlatforms.includes(platform)) {
      /*
       * Clearing this list ensures that when a new platform is selected, instead of enabling 2 platforms
       * we switch to 1 enabled platforms that was just toggled.
       */
      enabledPlatformsRef.current = [];
    } else {
      enabledPlatformsRef.current = enabledPlatformsRef.current.filter(p => p !== platform);
    }

    if (enabled) {
      enabledPlatformsRef.current.push(platform);
    }

    // Do not allow disabling the last platform
    if (!enabledPlatformsRef.current.length) {
      enabledPlatformsRef.current.push(platform);
    }

    emitSwitch();
  }

  function toggleDestination(index: number, enabled: boolean) {
    // In dual output mode, only allow non-ultra users to have 2 platforms, or 1 platform and 1 custom destination enabled
    if (isDualOutputMode && !isPrime) {
      if (enabledPlatformsRef.current.length + enabledDestRef.current.length < 2) {
        enabledDestRef.current.push(index);
      } else {
        enabledDestRef.current = enabledDestRef.current.filter((dest, i) => i !== index);
      }
      emitSwitch(index, enabled);
      return;
    }

    enabledDestRef.current = enabledDestRef.current.filter((dest, i) => i !== index);

    if (enabled) {
      enabledDestRef.current.push(index);
    }

    emitSwitch(index, enabled);
  }

  return (
    <div className={cx(styles.switchWrapper, styles.columnPadding)}>
      {platforms.map((platform, ind) => (
        <DestinationSwitcher
          key={platform}
          destination={platform}
          enabled={
            isPrime || isDualOutputMode
              ? isEnabled(platform)
              : isEnabled(platform) && (isPrimaryPlatform(platform) || platform === 'tiktok')
          }
          onChange={enabled => togglePlatform(platform, enabled)}
          switchDisabled={
            p?.disabled ||
            (disableNonTwitchSwitcher && platform !== 'twitch') || // Disable non-Twitch platforms if Twitch dual streaming is on
            (!isEnabled(platform) && disableNonUltraSwitchers) // Handle non-ultra user restrictions
          }
          showTwitchTooltip={disableNonTwitchSwitcher && platform !== 'twitch'}
          showDisabledAlert={
            disabledHorizontalUltraSwitcher === platform ||
            disabledVerticalUltraSwitcher === platform
          }
          isDualOutputMode={isDualOutputMode}
          index={ind}
        />
      ))}

      {customDestinations?.map((dest, ind) => (
        <DestinationSwitcher
          key={ind}
          destination={dest}
          enabled={dest.enabled && !disableCustomDestinationSwitchers}
          onChange={enabled => toggleDestination(ind, enabled)}
          switchDisabled={
            p?.disabled ||
            disableCustomDestinationSwitchers ||
            (!dest.enabled && disableNonUltraSwitchers)
          }
          isDualOutputMode={isDualOutputMode}
          index={ind}
        />
      ))}
    </div>
  );
}

interface IDestinationSwitcherProps {
  destination: TPlatform | ICustomStreamDestination;
  enabled: boolean;
  onChange: (enabled: boolean) => unknown;
  switchDisabled?: boolean;
  index: number;
  isDualOutputMode: boolean;
  isUnlinked?: boolean;
  showTwitchTooltip?: boolean;
  showDisabledAlert?: boolean;
}

/**
 * Render a single switcher
 */
// disable `func-call-spacing` and `no-spaced-func` rules
// to pass back reference to addClass function
// eslint-disable-next-line
const DestinationSwitcher = React.forwardRef<{}, IDestinationSwitcherProps>((p, ref) => {
  const switchInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const platform = typeof p.destination === 'string' ? (p.destination as TPlatform) : null;
  const disabled = p?.switchDisabled;
  const label = platform
    ? $t('Toggle %{platform}', { platform: platformLabels(platform) })
    : $t('Toggle Destination');

  function onClickHandler(ev: MouseEvent) {
    // If we're disabling the switch we shouldn't be emitting anything past below
    if (disabled || p.showDisabledAlert) {
      if (!Services.UserService.state.isPrime) {
        message.info({
          key: 'switcher-info-alert',
          content: (
            <div className={styles.alertContent}>
              <div>
                {$t(
                  "You've selected the two streaming destinations. Disable a destination to enable a different one. \nYou can always upgrade to Ultra for multistreaming.",
                )}
              </div>

              <i className="icon-close" />
            </div>
          ),
          className: styles.infoAlert,
          onClick: () => message.destroy('switcher-info-alert'),
        });
      }

      if (p.showDisabledAlert) {
        message.info({
          key: 'switcher-info-alert',
          content: (
            <div className={styles.alertContent}>
              <div>
                {$t('Cannot toggle off only enabled platform for this display orientation.')}
              </div>

              <i className="icon-close" />
            </div>
          ),
          className: styles.infoAlert,
          onClick: () => message.destroy('switcher-info-alert'),
        });
      }

      return;
    }

    const enable = !p.enabled;
    p.onChange(enable);
    // always proxy the click to the SwitchInput
    // so it can play a transition animation
    switchInputRef.current?.click();
  }

  const { title, description, Controller, Logo } = (() => {
    const { UserService } = Services;

    if (platform) {
      // define slots for a platform switcher
      const service = getPlatformService(platform);
      const platformAuthData = UserService.state.auth?.platforms[platform];
      const username = platformAuthData?.username ?? '';

      return {
        title: service.displayName,
        description: username,
        Logo: () => (
          <PlatformLogo platform={platform} className={cx(styles[`platform-logo-${platform}`])} />
        ),
        Controller: () => (
          <SwitchInput
            inputRef={switchInputRef}
            value={p.enabled}
            name={platform}
            disabled={disabled}
            uncontrolled
            label={label}
            nolabel
            className="platform-switch"
            color="secondary"
            size="default"
            skipWrapperAttrs={true}
          />
        ),
      };
    } else {
      // define slots for a custom destination switcher
      const destination = p.destination as ICustomStreamDestination;
      const name = `destination${p?.index}`;
      return {
        title: destination.name,
        description: destination.url,
        Logo: () => <i className={cx(styles.destinationLogo, 'fa fa-globe')} />,
        Controller: () => (
          <SwitchInput
            inputRef={switchInputRef}
            value={p.enabled}
            name={name}
            disabled={disabled}
            uncontrolled
            label={label}
            nolabel
            className="destination-switch"
            color="secondary"
            size="default"
            skipWrapperAttrs={true}
          />
        ),
      };
    }
  })();

  return (
    <Tooltip
      title={p.showTwitchTooltip ? $t('Disable Twitch dual stream to add another platform') : null}
      placement="left"
      overlayClassName={styles.switcherTooltip}
    >
      <div
        ref={containerRef}
        className={cx('single-output-card', styles.platformSwitcher, {
          [styles.platformDisabled]: !p.enabled && !p?.isUnlinked,
          [styles.platformEnabled]: p.enabled,
        })}
        onClick={onClickHandler}
      >
        {/* SWITCH */}
        <div className={cx(styles.colInput)}>
          <Controller />
        </div>

        {/* PLATFORM LOGO */}
        <div className={cx('logo', styles.platformLogo)}>
          <Logo />
        </div>

        {/* PLATFORM TITLE AND ACCOUNT/URL */}
        <div className={styles.colAccount}>
          <div className={styles.platformName}>{title}</div>
          <div className={styles.platformHandle}>{description}</div>
        </div>

        {/* DISPLAY TOGGLES */}
        {p.isDualOutputMode && !p?.isUnlinked && (
          <div className={styles.displaySelectorWrapper} onClick={e => e.stopPropagation()}>
            <DisplaySelector
              title={title}
              nolabel
              className={styles.dualOutputDisplaySelector}
              platform={platform}
              index={p.index}
            />
          </div>
        )}

        {/* CONNECT BUTTON */}
        {p?.isUnlinked && platform && (
          <ConnectButton platform={platform} className={styles.connectButton} />
        )}
      </div>
    </Tooltip>
  );
});
