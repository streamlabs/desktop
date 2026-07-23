import React, {
  useRef,
  useMemo,
  useImperativeHandle,
  forwardRef,
  MouseEvent,
  memo,
  useCallback,
} from 'react';
import { getPlatformService, platformLabels, TPlatform } from '../../../services/platforms';
import cx from 'classnames';
import { $t } from '../../../services/i18n';
import styles from './DestinationSwitchers.m.less';
import { ICustomStreamDestination } from '../../../services/settings/streaming';
import PlatformLogo from '../../shared/PlatformLogo';
import { useDebounce } from '../../hooks';
import { useGoLiveSettings } from './useGoLiveSettings';
import DisplaySelector from 'components-react/shared/DisplaySelector';
import { alertInfo } from '../../modals';
import { SwitcherCard, ISwitcherCardHandle } from './SwitcherCard';
import AnimatedWrapper from 'components-react/shared/AnimatedWrapper';

/**
 * Allows enabling/disabling platforms and custom destinations for the stream
 */
export const DestinationSwitchers = memo(() => {
  const {
    enabledPlatforms,
    customDestinations,
    enabledDestinations,
    switchPlatforms,
    switchCustomDestination,
    renderedPlatforms,
    isStreamShiftMode,
    isPatreonEnabled,
    isPrime,
    disableCustomDestinationSwitchers,
    disableNonUltraSwitchers,
    nonPrimeBothDisplayPlatform,
    getUsername,
    isLoading,
  } = useGoLiveSettings().extend(module => ({
    get renderedPlatforms() {
      // Some platforms are always shown, even if not linked so add them to the list of platforms to display
      const unlinkedAlwaysShownPlatforms = module.alwaysShownPlatforms.filter(
        platform => !module.isPlatformLinked(platform),
      );

      return unlinkedAlwaysShownPlatforms.length
        ? module.linkedPlatforms.concat(unlinkedAlwaysShownPlatforms)
        : module.linkedPlatforms;
    },
  }));

  // Use these references to apply debounce for error handling and switch animation
  const enabledPlatformsRef = useRef(enabledPlatforms);
  enabledPlatformsRef.current = enabledPlatforms;
  const enabledDestRef = useRef(enabledDestinations);
  enabledDestRef.current = enabledDestinations;

  const emitSwitch = useDebounce(500, (ind?: number, enabled?: boolean) => {
    if (ind !== undefined && enabled !== undefined) {
      switchCustomDestination(ind, enabled);
    } else {
      switchPlatforms(enabledPlatformsRef.current);
    }
  });

  const isEnabled = useCallback(
    (target: TPlatform | number) => {
      if (typeof target === 'number') {
        return enabledDestRef.current.includes(target);
      } else {
        return enabledPlatformsRef.current.includes(target);
      }
    },
    [enabledDestRef, enabledPlatformsRef],
  );

  const togglePlatform = useCallback(
    (platform: TPlatform, enabled: boolean) => {
      // Only allow non-ultra users to have 2 platforms, or 1 platform and 1 custom destination enabled
      if (!isPrime) {
        return toggleNonUltraPlatform(platform, enabled);
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

  const toggleNonUltraPlatform = useCallback(
    (platform: TPlatform, enabled: boolean) => {
      if (enabled) {
        const total = enabledPlatformsRef.current.length + enabledDestRef.current.length;
        if (total >= 2) {
          alertInfo({
            name: 'switcher-info-alert',
            text: $t(
              "You've reached the maximum of 2 streaming destinations. Upgrade to Ultra to enable multistreaming.",
            ),
          });
          return false;
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
    },
    [enabledPlatformsRef, emitSwitch],
  );

  const toggleDestination = useCallback(
    (index: number, enabled: boolean) => {
      // In dual output mode, only allow non-ultra users to have 2 platforms, or 1 platform and 1 custom destination enabled
      if (!isPrime) {
        return toggleNonUltraDestination(index, enabled);
      }

      enabledDestRef.current = enabledDestRef.current.filter((dest, i) => i !== index);

      if (enabled) {
        enabledDestRef.current.push(index);
      }

      emitSwitch(index, enabled);

      return enabledDestRef.current.includes(index);
    },
    [emitSwitch, enabledDestRef, isPrime],
  );

  const toggleNonUltraDestination = useCallback(
    (index: number, enabled: boolean) => {
      if (enabled) {
        const total = enabledPlatformsRef.current.length + enabledDestRef.current.length;
        if (total >= 2) {
          alertInfo({
            name: 'switcher-info-alert',
            text: $t(
              "You've reached the maximum of 2 streaming destinations. Upgrade to Ultra to enable multistreaming.",
            ),
          });
          return false;
        }
      }
      enabledDestRef.current = enabledDestRef.current.filter(dest => dest !== index);
      if (enabled) {
        enabledDestRef.current.push(index);
      }
      emitSwitch(index, enabled);
      return enabledDestRef.current.includes(index);
    },
    [enabledDestRef],
  );

  const hideDisplaySelector = useMemo(() => {
    return isPatreonEnabled ? false : isStreamShiftMode;
  }, [isPatreonEnabled, isStreamShiftMode]);

  return (
    <div className={cx(styles.switchWrapper)}>
      {renderedPlatforms.map((platform, ind) => {
        const enabled = isEnabled(platform);
        const disabledByBoth =
          !!nonPrimeBothDisplayPlatform && !enabled && platform !== nonPrimeBothDisplayPlatform;
        const switchDisabled = (!enabled && disableNonUltraSwitchers) || disabledByBoth;
        const bothDisplayPlatformLabel = disabledByBoth
          ? platformLabels(nonPrimeBothDisplayPlatform!)
          : undefined;
        const visible = enabled && !hideDisplaySelector;

        return (
          <DestinationSwitcher
            key={platform}
            destination={platform}
            enabled={enabled}
            togglePlatform={togglePlatform}
            switchDisabled={switchDisabled}
            bothDisplayPlatformLabel={bothDisplayPlatformLabel}
            showDisplaySelector={visible}
            isPrime={isPrime}
            username={getUsername(platform)}
            index={ind}
            isLoading={isLoading}
          />
        );
      })}

      {customDestinations?.map((dest, ind) => {
        const disabledByBoth = !!nonPrimeBothDisplayPlatform && !dest.enabled;
        const switchDisabled =
          disableCustomDestinationSwitchers ||
          (!dest.enabled && disableNonUltraSwitchers) ||
          disabledByBoth;
        const bothDisplayPlatformLabel = disabledByBoth
          ? platformLabels(nonPrimeBothDisplayPlatform!)
          : undefined;
        const visible = dest.enabled && !hideDisplaySelector;

        return (
          <DestinationSwitcher
            key={ind}
            destination={dest}
            enabled={dest.enabled && !disableCustomDestinationSwitchers}
            toggleDestination={toggleDestination}
            switchDisabled={switchDisabled}
            bothDisplayPlatformLabel={bothDisplayPlatformLabel}
            showDisplaySelector={visible}
            isPrime={isPrime}
            index={ind}
            isLoading={isLoading}
          />
        );
      })}
    </div>
  );
});

interface IDestinationSwitcherProps {
  destination: TPlatform | ICustomStreamDestination;
  enabled: boolean;
  togglePlatform?: (platform: TPlatform, enabled: boolean) => unknown;
  toggleDestination?: (index: number, enabled: boolean) => unknown;
  switchDisabled?: boolean;
  bothDisplayPlatformLabel?: string;
  index: number;
  showDisplaySelector: boolean;
  isPrime: boolean;
  username?: string;
  isUnlinked?: boolean;
  /** Disable the switch while the go live window is loading/refreshing settings */
  isLoading?: boolean;
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

    useImperativeHandle(
      ref,
      () => ({
        toggle: () => cardRef.current?.toggle(),
        enable: () => cardRef.current?.enable(),
        disable: () => cardRef.current?.disable(),
      }),
      [cardRef],
    );

    const platform = typeof p.destination === 'string' ? (p.destination as TPlatform) : null;
    const disabled = p?.switchDisabled;
    const label = platform
      ? $t('Toggle %{platform}', { platform: platformLabels(platform) })
      : $t('Toggle Destination');

    const onChange = useCallback(
      (enabled: boolean) => {
        if (platform && p.togglePlatform) {
          return p.togglePlatform(platform, enabled);
        } else if (p.toggleDestination) {
          return p.toggleDestination(p.index, enabled);
        }
      },
      [platform, p.index, p.togglePlatform, p.toggleDestination],
    );

    const onClickHandler = useCallback(
      (e: MouseEvent) => {
        const enabled = p.enabled;

        // Ignore toggles while the go live window is loading/refreshing settings
        if (p.isLoading) return enabled;

        if (!p.isPrime) {
          if (p.bothDisplayPlatformLabel) {
            alertInfo({
              name: 'switcher-info-alert',
              text: $t(
                'Select a different display for %{platform} to toggle on another destination, or upgrade to Ultra to enable multistreaming.',
                { platform: p.bothDisplayPlatformLabel },
              ),
            });
            return enabled;
          }

          // Max-2 check is done inside togglePlatform/toggleDestination using current refs,
          // so always pass through — the handler shows the message if needed.
          return onChange(!enabled);
        }

        if (disabled) return enabled;
        return onChange(!enabled);
      },
      [p.enabled, p.isLoading, onChange, p.bothDisplayPlatformLabel, disabled],
    );

    const { title, description } = useMemo(() => {
      if (platform) {
        // define slots for a platform switcher
        const service = getPlatformService(platform);
        return {
          title: service.displayName,
          description: p.username ?? '',
        };
      } else {
        // define slots for a custom destination switcher
        const destination = p.destination as ICustomStreamDestination;
        return {
          title: destination.name,
          description: destination.url,
        };
      }
    }, [platform, p.username, p.destination]);

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

    const name = useMemo(() => {
      if (platform) {
        return platform;
      }
      if (p.destination && typeof p.destination !== 'string') {
        return (p.destination as ICustomStreamDestination).name.replace(/\s+/g, '');
      }
      return `destination${p.index}`;
    }, [platform, p.destination, p.index]);

    return (
      <SwitcherCard
        ref={cardRef}
        onClick={onClickHandler}
        value={p.enabled}
        switchClassName={platform ? 'platform-switch' : 'destination-switch'}
        icon={icon}
        name={name}
        label={label}
        title={title}
        description={description}
        switchDisabled={p.isLoading}
        className={cx({ [styles.disabled]: disabled })}
        tooltipClassName={styles.switcherTooltip}
      >
        {/* DISPLAY TOGGLES */}
        <AnimatedWrapper
          visible={p.showDisplaySelector}
          className={styles.displaySelectorWrapper}
          onClick={e => e.stopPropagation()}
          height="35px"
        >
          <DisplaySelector
            destinationName={!platform ? name : undefined}
            title={title}
            nolabel
            className={styles.displaySelector}
            platform={platform}
            index={p.index}
            alignIcons="left"
            visible={p.showDisplaySelector}
            disabled={p.isLoading}
          />
        </AnimatedWrapper>
      </SwitcherCard>
    );
  }),
);
