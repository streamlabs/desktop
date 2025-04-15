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
import DestinationSelector from './DestinationSelector';
import AddDestinationButton from 'components-react/shared/AddDestinationButton';
import { promptAction } from 'components-react/modals';

/**
 * Allows enabling/disabling platforms and custom destinations for the stream
 */
export function DestinationSwitchers() {
  const {
    linkedPlatforms,
    enabledPlatforms,
    customDestinations,
    enabledDestinations,
    switchPlatforms,
    switchCustomDestination,
    isPlatformLinked,
    isRestreamEnabled,
    isDualOutputMode,
    isPrime,
    alwaysEnabledPlatforms,
    alwaysShownPlatforms,
  } = useGoLiveSettings();

  // use these references to apply debounce
  // for error handling and switch animation
  const enabledPlatformsRef = useRef(enabledPlatforms);
  enabledPlatformsRef.current = enabledPlatforms;
  const enabledDestRef = useRef(enabledDestinations);
  enabledDestRef.current = enabledDestinations;
  const destinationSwitcherRef = useRef({ addClass: () => undefined });

  // some platforms are always shown, even if not linked
  // add them to the list of platforms to display
  const platforms = useMemo(() => {
    const displayedPlatforms = isDualOutputMode && !isPrime ? enabledPlatforms : linkedPlatforms;
    const unlinkedAlwaysShownPlatforms = alwaysShownPlatforms.filter(
      platform => !isPlatformLinked(platform),
    );
    return unlinkedAlwaysShownPlatforms.length
      ? displayedPlatforms.concat(unlinkedAlwaysShownPlatforms)
      : displayedPlatforms;
  }, [linkedPlatforms, enabledPlatformsRef.current, isDualOutputMode, isPrime]);

  // in dual output mode for non-ultra users, only one custom destination can be enabled
  const destinations =
    isDualOutputMode && !isPrime ? customDestinations.filter(d => d.enabled) : customDestinations;

  // there are four different UIs for the switchers for each combination of output mode and ultra status.
  // the below determines which elements to show
  const showSelector =
    isDualOutputMode &&
    !isPrime &&
    enabledPlatforms.length < 2 &&
    customDestinations.filter(d => d.enabled).length < 1;
  const hidePlatformController =
    isDualOutputMode && platforms.length === 1 && destinations.length === 1;
  const showAddDestButton = isDualOutputMode && !isPrime && !showSelector;

  const shouldDisableCustomDestinationSwitchers = () => {
    // Multistream users can always add destinations
    if (isRestreamEnabled) {
      return false;
    }

    // Otherwise, only a single platform and no custom destinations
    return enabledPlatforms.length > 0;
  };

  const disableCustomDestinationSwitchers = shouldDisableCustomDestinationSwitchers();

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
    // In dual output mode, only allow non-ultra users to have 2 platforms, or 1 platform and 1 custom destination enabled
    if (isDualOutputMode && !isPrime) {
      if (enabledPlatformsRef.current.length < 2 && enabledDestRef.current.length < 1) {
        enabledPlatformsRef.current.push(platform);
      } else {
        enabledPlatformsRef.current = enabledPlatformsRef.current.filter(p => p !== platform);
      }
      emitSwitch();
      return;
    }

    // user can always stream to tiktok and kick
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
          enabled={isEnabled(platform)}
          onChange={enabled => togglePlatform(platform, enabled)}
          isDualOutputMode={isDualOutputMode}
          index={ind}
          hideController={showSelector || hidePlatformController}
          showPrompt={alwaysShownPlatforms.includes(platform) && !isPlatformLinked(platform)}
        />
      ))}

      {destinations?.map((dest, ind) => (
        <DestinationSwitcher
          key={ind}
          destination={dest}
          enabled={dest.enabled && !disableCustomDestinationSwitchers}
          onChange={enabled => toggleDestination(ind, enabled)}
          switchDisabled={disableCustomDestinationSwitchers}
          isDualOutputMode={isDualOutputMode}
          index={ind}
        />
      ))}
      {showSelector && (
        <DestinationSelector
          togglePlatform={platform => {
            togglePlatform(platform, true);
            destinationSwitcherRef.current.addClass();
          }}
          showSwitcher={destinationSwitcherRef.current.addClass}
          switchDestination={index => {
            toggleDestination(index, true);
            destinationSwitcherRef.current.addClass();
          }}
        />
      )}
      {showAddDestButton && <AddDestinationButton />}
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
  hideController?: boolean;
  showPrompt?: boolean;
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
  const disabled = p?.switchDisabled || p?.showPrompt;

  const { RestreamService, MagicLinkService, NavigationService, WindowsService } = Services;

  function dualOutputClickHandler(ev: MouseEvent) {
    if (p.showPrompt && platform) {
      renderPrompt();
      return;
    }

    if (RestreamService.views.canEnableRestream) {
      p.onChange(!p.enabled);
      // always proxy the click to the SwitchInput
      // so it can play a transition animation
      switchInputRef.current?.click();
      // switch the container class without re-rendering to not stop the animation
      if (!p.enabled) {
        containerRef.current?.classList.remove(styles.platformDisabled);
      } else {
        containerRef.current?.classList.add(styles.platformDisabled);
      }
    } else {
      MagicLinkService.actions.linkToPrime('slobs-multistream');
    }
  }

  function onClickHandler(ev: MouseEvent) {
    if (p.showPrompt && platform) {
      renderPrompt();
      return;
    }

    // If we're disabling the switch we shouldn't be emitting anything past below
    if (disabled) {
      return;
    }

    const enable = !p.enabled;
    p.onChange(enable);
    // always proxy the click to the SwitchInput
    // so it can play a transition animation
    switchInputRef.current?.click();
  }

  function renderPrompt() {
    if (!platform) return;

    const message = RestreamService.views.canEnableRestream
      ? $t('Connect your %{platform} account to stream to %{platform}.', {
          platform: platformLabels(platform),
        })
      : $t(
          'Connect your %{platform} account to stream to %{platform}. Try streaming to %{platform} and another platform at the same time for free in dual output mode, or multistream with ultra.',
          {
            platform: platformLabels(platform),
          },
        );

    promptAction({
      title: $t('Connect your %{platform} account', { platform: platformLabels(platform) }),
      icon: <PlatformLogo platform={platform} className={styles.actionModalLogo} />,
      message,
      btnText: $t('Connect'),
      fn: () => {
        NavigationService.actions.navigate('PlatformMerge', {
          platform,
        });
        WindowsService.actions.closeChildWindow();
      },
    });
  }

  const { title, description, Controller, Logo } = (() => {
    const { UserService } = Services;
    const showCloseIcon = p.isDualOutputMode && !UserService.views.isPrime && !p?.showPrompt;

    if (platform) {
      // define slots for a platform switcher
      const service = getPlatformService(platform);
      const platformAuthData = UserService.state.auth?.platforms[platform];
      const username = platformAuthData?.username ?? '';

      return {
        title: $t('Stream to %{platformName}', { platformName: service.displayName }),
        description: username,
        Logo: () => (
          <PlatformLogo
            platform={platform}
            className={cx(
              styles[`platform-logo-${platform}`],
              p.isDualOutputMode ? styles.dualOutputLogo : styles.singleOutputLogo,
            )}
          />
        ),
        Controller: () =>
          showCloseIcon ? (
            <i
              className={cx('icon-close', 'platform-close', styles.close)}
              onClick={e => {
                p.onChange(false);
                e.stopPropagation();
              }}
            />
          ) : (
            <SwitchInput
              inputRef={switchInputRef}
              value={p.enabled}
              name={platform}
              disabled={disabled}
              uncontrolled
              nolabel
              className={cx('platform-switch', {
                [styles.dualOutputPlatformSwitch]: p.isDualOutputMode,
              })}
              checkedChildren={p.isDualOutputMode && <i className="icon-check-mark" />}
            />
          ),
      };
    } else {
      // define slots for a custom destination switcher
      const destination = p.destination as ICustomStreamDestination;
      return {
        title: destination.name,
        description: destination.url,
        Logo: () => <i className={cx(styles.destinationLogo, 'fa fa-globe')} />,
        Controller: () =>
          showCloseIcon ? (
            <i
              className={cx('icon-close', 'destination-close', styles.close)}
              onClick={e => {
                p.onChange(false);
                e.stopPropagation();
              }}
            />
          ) : (
            <SwitchInput
              inputRef={switchInputRef}
              value={p.enabled}
              name={`destination_${destination.name}`}
              disabled={disabled}
              uncontrolled
              nolabel
              className={cx('destination-switch', {
                [styles.dualOutputPlatformSwitch]: p.isDualOutputMode,
              })}
              checkedChildren={p.isDualOutputMode && <i className="icon-check-mark" />}
            />
          ),
      };
    }
  })();

  return (
    <>
      {/* SINGLE OUTPUT */}
      {!p.isDualOutputMode && (
        <div
          ref={containerRef}
          className={cx('single-output-card', styles.platformSwitcher, {
            [styles.platformDisabled]: !p.enabled,
          })}
          onClick={onClickHandler}
        >
          {/* SWITCH */}
          <div className={cx(styles.colInput)}>
            <Controller />
          </div>

          {/* PLATFORM LOGO */}
          <div className="logo margin-right--20">
            <Logo />
          </div>

          {/* PLATFORM TITLE AND ACCOUNT/URL */}
          <div className={styles.colAccount}>
            <span className={styles.platformName}>{title}</span> <br />
            {description} <br />
          </div>
        </div>
      )}

      {/* DUAL OUTPUT */}
      {p.isDualOutputMode && (
        <div
          ref={containerRef}
          data-test={platform ? `${platform}-dual-output` : 'destination-dual-output'}
          className={cx('dual-output-card', styles.dualOutputPlatformSwitcher, {
            [styles.platformDisabled]: !p.enabled,
          })}
          onClick={e => {
            if (p.showPrompt) {
              renderPrompt();
              e.preventDefault();
            }
          }}
        >
          <div className={styles.dualOutputPlatformInfo}>
            {/* PLATFORM LOGO */}
            <Logo />
            {/* PLATFORM TITLE AND ACCOUNT/URL */}
            <div className={styles.dualOutputColAccount}>
              <div className={styles.dualOutputPlatformName}>{title}</div>
              <div className={styles.dualOutputPlatformUsername}>{description}</div>
            </div>
            {/* SWITCH */}
            <div
              className={cx(styles.dualOutputColInput)}
              onClick={e => {
                if (p.hideController) return;
                dualOutputClickHandler(e);
              }}
            >
              {!p.hideController && <Controller />}
            </div>
          </div>

          <DisplaySelector
            title={title}
            className={styles.dualOutputDisplaySelector}
            platform={platform}
            label={$t('Output')}
            index={p.index}
          />
        </div>
      )}
    </>
  );
});
