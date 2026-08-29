import React, {
  ReactNode,
  forwardRef,
  MouseEvent,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useCallback,
} from 'react';
import cx from 'classnames';
import styles from './DestinationSwitchers.m.less';
import Tooltip from 'components-react/shared/Tooltip';
import { SwitchInput } from '../../shared/inputs';

export interface ISwitcherCardHandle {
  toggle: () => void;
  enable: () => void;
  disable: () => void;
}

interface ISwitcherCardProps {
  children?: ReactNode;
  icon?: string | ReactNode;
  label?: string;
  title: string | ReactNode;
  name: string;
  description: string;
  value: boolean;
  onClick: (e: MouseEvent) => boolean | void | unknown;
  tooltip?: string;
  tooltipDisabled?: boolean;
  className?: string;
  switchClassName?: string;
  tooltipClassName?: string;
  disabled?: boolean;
  switchDisabled?: boolean;
}

interface ISwitcherCardContentsProps {
  className?: string;
  switchClassName?: string;
  onClick: (e: MouseEvent) => void;
  onTransitionEnd: (e: React.TransitionEvent<HTMLDivElement>) => void;
  value: boolean;
  name: string;
  disabled?: boolean;
  label?: string;
  title: string | ReactNode;
  icon?: string | ReactNode;
  description: string;
  children?: ReactNode;
  switchDisabled?: boolean;
}

/**
 * Render a reusable switcher card shell.
 * Pass a `controller` (e.g. a SwitchInput) for the left column and
 * any content as `children` for the right column.
 */
export const SwitcherCard = forwardRef<ISwitcherCardHandle, ISwitcherCardProps>((p, ref) => {
  const valueRef = useRef<boolean | null>(null);
  const [displayValue, setDisplayValue] = useState(p.value);

  const animateSwitch = useCallback((nextValue: boolean, resolvedValue = nextValue) => {
    valueRef.current = resolvedValue !== nextValue ? resolvedValue : null;
    setDisplayValue(nextValue);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      toggle: () => animateSwitch(!displayValue),
      enable: () => animateSwitch(true),
      disable: () => animateSwitch(false),
    }),
    [displayValue, animateSwitch],
  );

  useEffect(() => {
    valueRef.current = null;
    setDisplayValue(p.value);
  }, [p.value]);

  const handleTransitionEnd = useCallback((e: React.TransitionEvent<HTMLDivElement>) => {
    const target = e.target;

    if (!(target instanceof HTMLElement) || valueRef.current === null) {
      return;
    }

    setDisplayValue(valueRef.current);
    valueRef.current = null;
  }, []);

  const handleClick = useCallback(
    (e: MouseEvent) => {
      if (p.disabled) {
        p.onClick(e);
        return;
      }

      const nextValue = !p.value;
      const resolvedValue = p.onClick(e);
      animateSwitch(nextValue, typeof resolvedValue === 'boolean' ? resolvedValue : nextValue);
    },
    [p.disabled, p.value, p.onClick, animateSwitch],
  );

  return (
    <Tooltip
      title={p.tooltip ?? null}
      placement="left"
      className={p.tooltipClassName}
      overlayClassName={styles.switcherTooltip}
      disabled={p.tooltipDisabled}
      styleContent={false}
      lightShadow={true}
    >
      <SwitcherCardContents
        className={p.className}
        switchClassName={p.switchClassName}
        onClick={handleClick}
        onTransitionEnd={handleTransitionEnd}
        value={displayValue}
        name={p.name}
        disabled={p.disabled || p.switchDisabled}
        label={p.label}
        title={p.title}
        icon={p.icon}
        description={p.description}
      >
        {p.children}
      </SwitcherCardContents>
    </Tooltip>
  );
});

function SwitcherCardContents(p: ISwitcherCardContentsProps) {
  return (
    <div className={cx(styles.platformSwitcher, p.className)} onClick={p.onClick}>
      <div className={styles.destinationInfo}>
        <div className={styles.colInput} onTransitionEnd={p.onTransitionEnd}>
          <SwitchInput
            value={p.value}
            name={p.name}
            disabled={p.disabled}
            label={p.label ?? p.title}
            nolabel
            className={p.switchClassName}
            skipWrapperAttrs={true}
          />
        </div>

        <div className={styles.colInfo}>
          <div className={styles.colAccount}>
            {/* PLATFORM LOGO AND NAME*/}
            {typeof p.icon === 'string' ? (
              <i className={p.icon} style={{ color: 'var(--title)', marginRight: '8px' }} />
            ) : (
              p.icon
            )}
            {/* PLATFORM HANDLE */}
            <div className={styles.platformName}>{p.title}</div>
          </div>
          <div className={styles.platformHandle}>{p.description}</div>
          {p?.children}
        </div>
      </div>
    </div>
  );
}
