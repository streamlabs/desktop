import { Menu } from 'antd';
import cx from 'classnames';
import React from 'react';
import { ENavMenuKey } from 'services/nav-menu';
import { useFeaturesNav } from './FeaturesNav';
import styles from './NavMenu.m.less';
import { useToolsNav } from './ToolsNav';

export default function NavMenu() {
  // Both hooks are inlined here (not rendered as component children) so that
  // rc-menu's overflow measurement sees individual Menu.Item nodes rather than
  // opaque component elements - antd 4.16 / rc-menu 9 only flattens arrays and
  // fragments that are *direct* children of <Menu>.
  const featureItems = useFeaturesNav();
  const { items: toolItems, modals } = useToolsNav();

  return (
    <div className={cx(styles.navMenu)}>
      <Menu
        key="nav-menu"
        mode="horizontal"
        defaultSelectedKeys={[ENavMenuKey.Editor]}
        getPopupContainer={triggerNode => triggerNode}
      >
        {featureItems}
        {toolItems}
      </Menu>
      {modals}
    </div>
  );
}
