import React, {
  useRef,
  useMemo,
  useImperativeHandle,
  forwardRef,
  MouseEvent,
  memo,
  useCallback,
  useEffect,
} from 'react';
import { getPlatformService, platformLabels, TPlatform } from '../../../services/platforms';
import cx from 'classnames';
import { $t } from '../../../services/i18n';
import styles from './DestinationSwitchers.m.less';
import { ICustomStreamDestination } from '../../../services/settings/streaming';
import { Services } from '../../service-provider';
import PlatformLogo from '../../shared/PlatformLogo';
import { useDebounce } from '../../hooks';
import { useGoLiveSettings } from './useGoLiveSettings';
import DisplaySelector from 'components-react/shared/DisplaySelector';
import { message } from 'antd';
import { SwitcherCard, ISwitcherCardHandle } from './SwitcherCard';
import AnimatedWrapper from 'components-react/shared/AnimatedWrapper';

/**
 * Allows enabling/disabling platforms and custom destinations for the stream
 */
export const DestinationSwitchers = memo(() => {
  const {
    linkedPlatforms,
    enabledPlatforms,
    customDestinations,
    enabledDestinations,
    switchPlatforms,
    switchCustomDestination,
    isPlatformLinked,
    isStreamShiftMode,
    isPatreonEnabled,
    isPrime,
    alwaysShownPlatforms,
    disableCustomDestinationSwitchers,
    disableNonUltraSwitchers,
    nonPrimeBothDisplayPlatform,
    setPlatformEnabled,
    setCustomDestinationEnabled,
  } = useGoLiveSettings();

  /// Use these references to apply debounce for error handling and switch animation
  const enabledPlatformsRef = useRef(enabledPlatforms);
  enabledPlatformsRef.current = enabledPlatforms;
  const enabledDestRef = useRef(enabledDestinations);
  enabledDestRef.current = enabledDestinations;

  // Keep values in refs so the toggle handlers below can stay referentially stable.
  // The handlers only run on user actions (never during render), so reading `.current`
  // always has the latest value.
  const isPrimeRef = useRef(isPrime);
  isPrimeRef.current = isPrime;

  // Some platforms are always shown, even if not linked so add them to the list of platforms to display
  const platforms = useMemo(() => {
    const unlinkedAlwaysShownPlatforms = alwaysShownPlatforms.filter(
      platform => !isPlatformLinked(platform),
    );
    return unlinkedAlwaysShownPlatforms.length
      ? linkedPlatforms.concat(unlinkedAlwaysShownPlatforms)
      : linkedPlatforms;
  }, [linkedPlatforms, enabledPlatformsRef.current, enabledPlatforms]);

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

  const togglePlatform = useCallback(
    (platform: TPlatform, enabled: boolean) => {
      // Only allow non-ultra users to have 2 platforms, or 1 platform and 1 custom destination enabled
      if (!isPrimeRef.current) {
        if (enabled) {
          const total = enabledPlatformsRef.current.length + enabledDestRef.current.length;
          if (total >= 2) {
            enabledPlatformsRef.current = enabledPlatformsRef.current.slice(1);
          }
          enabledPlatformsRef.current.push(platform);
        } else {
          enabledPlatformsRef.current = enabledPlatformsRef.current.filter(p => p !== platform);
        }

        if (!enabledPlatformsRef.current.length) {
          enabledPlatformsRef.current.push(platform);
        }

        emitSwitch();
        return enabledPlatformsRef.current.includes(platform);
      }

      if (enabled) {
        enabledPlatformsRef.current.push(platform);
      } else {
        enabledPlatformsRef.current = enabledPlatformsRef.current.filter(p => p !== platform);
      }

      // Do not allow disabling the last platform
      if (!enabledPlatformsRef.current.length) {
        enabledPlatformsRef.current.push(platform);
      }

      emitSwitch();
      return enabledPlatformsRef.current.includes(platform);
    },
    [emitSwitch],
  );

  const toggleDestination = useCallback(
    (index: number, enabled: boolean) => {
      // In dual output mode, only allow non-ultra users to have 2 platforms, or 1 platform and 1 custom destination enabled
      if (!isPrimeRef.current) {
        enabledDestRef.current = enabledDestRef.current.filter(dest => dest !== index);
        if (enabled) {
          enabledDestRef.current.push(index);
        }
        emitSwitch(index, enabled);
        return;
      }

      enabledDestRef.current = enabledDestRef.current.filter((dest, i) => i !== index);

      if (enabled) {
        enabledDestRef.current.push(index);
      }

      emitSwitch(index, enabled);

      return enabledDestRef.current.includes(index);
    },
    [emitSwitch],
  );

  // Cache one stable onChange per key so the memoized <DestinationSwitcher>s
  // aren't re-rendered by a fresh inline arrow on every parent render.
  // eslint-disable-next-line no-spaced-func, func-call-spacing
  const platformHandlers = useRef<Record<string, (isEnabled: boolean) => void>>({});
  const getPlatformHandler = (platform: TPlatform) =>
    platformHandlers.current[platform] ??
    (platformHandlers.current[platform] = (isEnabled: boolean) =>
      togglePlatform(platform, isEnabled));

  // eslint-disable-next-line no-spaced-func, func-call-spacing
  const destHandlers = useRef<Record<number, (isEnabled: boolean) => void>>({});
  const getDestHandler = (ind: number) =>
    destHandlers.current[ind] ??
    (destHandlers.current[ind] = (enabled: boolean) => toggleDestination(ind, enabled));

  const customDestinationsRef = useRef(customDestinations);
  customDestinationsRef.current = customDestinations;

  const disabledByBothRef = useRef<
    { type: 'platform'; id: TPlatform } | { type: 'destination'; index: number } | null
  >(null);
  const prevBothPlatformRef = useRef<TPlatform | null>(null);

  useEffect(() => {
    const prev = prevBothPlatformRef.current;
    prevBothPlatformRef.current = nonPrimeBothDisplayPlatform;

    if (nonPrimeBothDisplayPlatform && !prev) {
      const otherPlatform = enabledPlatformsRef.current.find(
        p => p !== nonPrimeBothDisplayPlatform,
      );
      if (otherPlatform) {
        setPlatformEnabled(otherPlatform, false);
        disabledByBothRef.current = { type: 'platform', id: otherPlatform };
        message.info({
          key: 'both-display-info-alert',
          content: (
            <div className={styles.alertContent}>
              <div>
                {$t(
                  '%{otherPlatform} was disabled because %{platform} dual streaming was selected. Upgrade to Ultra to enable multistreaming.',
                  {
                    platform: platformLabels(nonPrimeBothDisplayPlatform),
                    otherPlatform: platformLabels(otherPlatform),
                  },
                )}
              </div>
              <i className="icon-close" />
            </div>
          ),
          className: styles.infoAlert,
          onClick: () => message.destroy('both-display-info-alert'),
        });
      } else {
        const destIndex = customDestinationsRef.current.findIndex(d => d.enabled);
        if (destIndex >= 0) {
          setCustomDestinationEnabled(destIndex, false);
          disabledByBothRef.current = { type: 'destination', index: destIndex };
          message.info({
            key: 'both-display-info-alert',
            content: (
              <div className={styles.alertContent}>
                <div>
                  {$t(
                    '%{destination} was disabled because %{platform} dual streaming was selected. Upgrade to Ultra to enable multistreaming.',
                    {
                      platform: platformLabels(nonPrimeBothDisplayPlatform),
                      destination: customDestinationsRef.current[destIndex].name,
                    },
                  )}
                </div>
                <i className="icon-close" />
              </div>
            ),
            className: styles.infoAlert,
            onClick: () => message.destroy('both-display-info-alert'),
          });
        }
      }
    } else if (!nonPrimeBothDisplayPlatform && disabledByBothRef.current) {
      const tracked = disabledByBothRef.current;
      disabledByBothRef.current = null;
      if (tracked.type === 'platform') {
        setPlatformEnabled(tracked.id, true);
      } else {
        setCustomDestinationEnabled(tracked.index, true);
      }
    }
  }, [nonPrimeBothDisplayPlatform, setPlatformEnabled, setCustomDestinationEnabled]);

  const hideDisplaySelector = useMemo(() => {
    return isPatreonEnabled ? false : isStreamShiftMode;
  }, [isPatreonEnabled, isStreamShiftMode]);

  return (
    <div className={cx(styles.switchWrapper)}>
      {platforms.map((platform, ind) => {
        const disabledByBoth =
          !!nonPrimeBothDisplayPlatform &&
          !isEnabled(platform) &&
          platform !== nonPrimeBothDisplayPlatform;
        return (
          <DestinationSwitcher
            key={platform}
            destination={platform}
            enabled={isEnabled(platform)}
            onChange={getPlatformHandler(platform)}
            switchDisabled={(!isEnabled(platform) && disableNonUltraSwitchers) || disabledByBoth}
            bothDisplayPlatformLabel={
              disabledByBoth ? platformLabels(nonPrimeBothDisplayPlatform!) : undefined
            }
            hideDisplaySelector={hideDisplaySelector}
            index={ind}
          />
        );
      })}

      {customDestinations?.map((dest, ind) => {
        const disabledByBoth = !!nonPrimeBothDisplayPlatform && !dest.enabled;
        return (
          <DestinationSwitcher
            key={ind}
            destination={dest}
            enabled={dest.enabled && !disableCustomDestinationSwitchers}
            onChange={getDestHandler(ind)}
            switchDisabled={
              disableCustomDestinationSwitchers ||
              (!dest.enabled && disableNonUltraSwitchers) ||
              disabledByBoth
            }
            bothDisplayPlatformLabel={
              disabledByBoth ? platformLabels(nonPrimeBothDisplayPlatform!) : undefined
            }
            hideDisplaySelector={hideDisplaySelector}
            index={ind}
          />
        );
      })}
    </div>
  );
});

interface IDestinationSwitcherProps {
  destination: TPlatform | ICustomStreamDestination;
  enabled: boolean;
  onChange: (enabled: boolean) => unknown;
  switchDisabled?: boolean;
  bothDisplayPlatformLabel?: string;
  index: number;
  hideDisplaySelector: boolean;
  isUnlinked?: boolean;
}

/**
 * Render a single switcher
 */
// disable `func-call-spacing` and `no-spaced-func` rules
// to pass back reference to addClass function
// eslint-disable-next-line
const DestinationSwitcher = memo(
  forwardRef<ISwitcherCardHandle, IDestinationSwitcherProps>((p, ref) => {
    const cardRef = useRef<ISwitcherCardHandle>(null);

    useImperativeHandle(ref, () => ({
      toggle: () => cardRef.current?.toggle(),
      enable: () => cardRef.current?.enable(),
      disable: () => cardRef.current?.disable(),
    }));

    const platform = typeof p.destination === 'string' ? (p.destination as TPlatform) : null;
    const disabled = p?.switchDisabled;
    const label = platform
      ? $t('Toggle %{platform}', { platform: platformLabels(platform) })
      : $t('Toggle Destination');

    const onClickHandler = useCallback(
      (e: MouseEvent) => {
        const enabled = p.enabled;

        // If we're disabling the switch we shouldn't be emitting anything past below
        if (disabled) {
          if (!Services.UserService.state.isPrime) {
            const content = p.bothDisplayPlatformLabel
              ? $t(
                  'Select a different display for %{platform} to toggle on another destination, or upgrade to Ultra to enable multistreaming.',
                  { platform: p.bothDisplayPlatformLabel },
                )
              : $t(
                  "You've reached the maximum of 2 streaming destinations. Upgrade to Ultra to enable multistreaming.",
                );

            message.info({
              key: 'switcher-info-alert',
              content: (
                <div className={styles.alertContent}>
                  <div>{content}</div>
                  <i className="icon-close" />
                </div>
              ),
              className: styles.infoAlert,
              onClick: () => message.destroy('switcher-info-alert'),
            });
          }
          return enabled;
        }

        return p.onChange(!enabled);
      },
      [p.enabled, p.onChange, p.bothDisplayPlatformLabel],
    );

    // Read the platform username (non-reactive, same as before) so it can key the memo below
    const username = platform
      ? Services.UserService.state.auth?.platforms[platform]?.username ?? ''
      : '';

    const { title, description } = useMemo(() => {
      if (platform) {
        // define slots for a platform switcher
        const service = getPlatformService(platform);
        return {
          title: service.displayName,
          description: username,
        };
      } else {
        // define slots for a custom destination switcher
        const destination = p.destination as ICustomStreamDestination;
        return {
          title: destination.name,
          description: destination.url,
        };
      }
    }, [platform, username, p.destination]);

    // Memoize the icon as an element (not a component type) so PlatformLogo is
    // reconciled as the same element across renders instead of being remounted
    const icon = useMemo(() => {
      if (platform) {
        return (
          <PlatformLogo
            platform={platform}
            className={cx(styles.platformLogo, styles[`platform-logo-${platform}`])}
          />
        );
      }
      return <i className={cx(styles.destinationLogo, 'fa fa-globe')} />;
    }, [platform]);

    return (
      <SwitcherCard
        ref={cardRef}
        onClick={onClickHandler}
        value={p.enabled}
        switchClassName={platform ? 'platform-switch' : 'destination-switch'}
        icon={icon}
        name={platform ?? `destination${p?.index}`}
        label={label}
        title={title}
        description={description}
        className={cx({ [styles.disabled]: disabled })}
        tooltipClassName={styles.switcherTooltip}
      >
        {/* DISPLAY TOGGLES */}
        <AnimatedWrapper
          visible={p.enabled && !p.hideDisplaySelector}
          className={styles.displaySelectorWrapper}
          onClick={e => e.stopPropagation()}
          height="35px"
        >
          <DisplaySelector
            title={title}
            nolabel
            className={styles.displaySelector}
            platform={platform}
            index={p.index}
            alignIcons="left"
            visible={p.enabled && !p.hideDisplaySelector}
          />
        </AnimatedWrapper>
      </SwitcherCard>
    );
  }),
);
