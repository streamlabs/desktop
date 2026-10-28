import React, { CSSProperties } from 'react';
import { Menu, MenuItemProps } from 'antd';
import styles from './MenuItem.m.less';
import cx from 'classnames';

interface IMenuProps extends MenuItemProps {
  title?: string;
  /**
   * Classes applied to the menu item li. Used to style the container for the
   * item's contents.
   *
   * @note `className` lands on the inner Menu.Item instead, where layout rules
   * like alignment never take effect. Instead, use `wrapperClassName` there.
   */
  className?: string;
  /**
   * Classes applied to the wrapper div, which is the actual flex child of the
   * surrounding `<Menu>`'s overflow container.
   */
  wrapperClassName?: string;
  /**
   * Styles applied to the menu item li. Used to style the container for the
   * item's contents.
   *
   * @note `style` lands on the inner Menu.Item instead, where layout rules
   * like alignment never take effect. Instead, use `wrapperStyle` there.
   */
  style?: CSSProperties;
  /**
   * Styles applied to the wrapper div, which is the actual flex child of the
   * surrounding `<Menu>`'s overflow container.
   */
  wrapperStyle?: CSSProperties;
}

export default function MenuItem(p: IMenuProps) {
  const { title, wrapperStyle, wrapperClassName, ...itemProps } = p;
  return (
    <>
      <div
        title={title}
        className={cx(styles.menuItemWrapper, wrapperClassName)}
        style={wrapperStyle}
      >
        <Menu.Item {...itemProps} className={cx(p?.className)} title={false}>
          {p.children}
        </Menu.Item>
      </div>
    </>
  );
}
