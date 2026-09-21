import { Menu } from 'antd';
import cx from 'classnames';
import React from 'react';
import { ENavMenuKey } from 'services/nav-menu';
import { useFeaturesNav } from './FeaturesNav';
import styles from './NavMenu.m.less';
import { useNavCollapse } from './useNavCollapse';
import { useToolsNav } from './ToolsNav';

export default function NavMenu() {
  // Both hooks are inlined here (not rendered as component children) so that
  // rc-menu's overflow measurement sees individual Menu.Item nodes rather than
  // opaque component elements - antd 4.16 / rc-menu 9 only flattens arrays and
  // fragments that are *direct* children of <Menu>.
  const { items: featureItems, contentKey: featuresKey } = useFeaturesNav();
  const { items: toolItems, modals, contentKey: toolsKey } = useToolsNav();

  const navRef = useNavCollapse(`${featuresKey}|${toolsKey}`);

  return (
    <div className={cx(styles.navMenu)} ref={navRef}>
      <Menu
        key="nav-menu"
        mode="horizontal"
        disabledOverflow
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
