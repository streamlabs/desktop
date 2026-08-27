import { Layout } from 'antd';
import cx from 'classnames';
import { useRealmObject } from 'components-react/hooks/realm';
import { Services } from 'components-react/service-provider';
import HelpTip from 'components-react/shared/HelpTip';
import Scrollable from 'components-react/shared/Scrollable';
import React, { memo } from 'react';
import { EDismissable } from 'services/dismissables';
import { $t } from 'services/i18n';
import FeaturesNav from './FeaturesNav';
import styles from './NavMenu.m.less';
import NavTools from './NavTools';

const { Sider } = Layout;

export default function NavMenu() {
  const { CustomizationService } = Services;
  const { leftDock } = useRealmObject(CustomizationService.state);

  return (
    <Layout hasSider className="nav-menu">
      <Sider className={cx(styles.navMenuSider, !leftDock && styles.noLeftDock)}>
        <Scrollable className={cx(styles.navMenuScroll)}>
          <FeaturesNav />
          <NavTools />
        </Scrollable>
        <LoginHelpTip />
      </Sider>
    </Layout>
  );
}

const LoginHelpTip = memo(function LoginHelpTip() {
  return (
    <HelpTip
      title={$t('Login')}
      dismissableKey={EDismissable.LoginPrompt}
      position={{ top: 'calc(100vh - 175px)', left: '80px' }}
      arrowPosition="bottom"
      style={{ position: 'absolute' }}
    >
      <div>
        {$t(
          'Gain access to additional features by logging in with your preferred streaming platform.',
        )}
      </div>
    </HelpTip>
  );
});
