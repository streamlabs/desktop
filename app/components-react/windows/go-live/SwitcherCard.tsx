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
import { Tooltip } from 'antd';
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
  tooltipTitle?: string;
  className?: string;
  switchClassName?: string;
  disabled?: boolean;
}

/**
 * Render a reusable switcher card shell.
 * Pass a `controller` (e.g. a SwitchInput) for the left column and
 * any content as `children` for the right column.
 */
export const SwitcherCard = forwardRef<ISwitcherCardHandle, ISwitcherCardProps>((p, ref) => {
  const valueRef = useRef<boolean | null>(null);
  const [displayValue, setDisplayValue] = useState(p.value);

  useImperativeHandle(ref, () => ({
    toggle: () => animateSwitch(!displayValue),
    enable: () => animateSwitch(true),
    disable: () => animateSwitch(false),
  }));

  useEffect(() => {
    valueRef.current = null;
    setDisplayValue(p.value);
  }, [p.value]);

  const animateSwitch = useCallback((nextValue: boolean, resolvedValue = nextValue) => {
    valueRef.current = resolvedValue !== nextValue ? resolvedValue : null;
    setDisplayValue(nextValue);
  }, []);

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
      title={p.tooltipTitle ?? null}
      placement="left"
      overlayClassName={styles.switcherTooltip}
    >
      <div className={cx(styles.platformSwitcher, p.className)} onClick={handleClick}>
        <div className={styles.destinationInfo}>
          <div className={styles.colInput} onTransitionEnd={handleTransitionEnd}>
            <SwitchInput
              value={displayValue}
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
    </Tooltip>
  );
});
