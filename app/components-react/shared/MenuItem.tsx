import React, { CSSProperties } from 'react';
import { Menu, MenuItemProps } from 'antd';
import styles from './MenuItem.m.less';
import cx from 'classnames';

interface IMenuProps extends MenuItemProps {
  title?: string;
  className?: string;
  style?: CSSProperties;
  type?: 'item' | 'submenu' | 'app';
}

export default function Menutem(p: IMenuProps) {
  const { title, style, type = 'item' } = p;

  return (
    <>
      <div title={title} className={styles.menuitemWrapper} style={style}>
        <Menu.Item
          {...p}
          className={cx(
            p?.className,
            type === 'item' && styles.rootMenuItem,
            type === 'submenu' && styles.submenuItem,
            type === 'app' && styles.appSidenavItem,
          )}
          title={false}
        >
          {p.children}
        </Menu.Item>
      </div>
    </>
  );
}
