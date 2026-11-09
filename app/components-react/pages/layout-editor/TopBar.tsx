import { Tooltip } from 'antd';
import cx from 'classnames';
import { useVuex } from 'components-react/hooks';
import { Services } from 'components-react/service-provider';
import { ListInput } from 'components-react/shared/inputs';
import Form from 'components-react/shared/inputs/Form';
import React from 'react';
import { $t } from 'services/i18n';
import { ELayoutElement } from 'services/layout';
import { ENavMenuKey } from 'services/nav-menu';
import styles from './LayoutEditor.m.less';
import { useLayoutEditor } from './hooks';

export default function TopBar() {
  const { LayoutService, NavigationService, NavMenuService } = Services;
  const {
    slottedElements,
    browserUrl,
    currentLayout,
    dockLayout,
    setShowModal,
    setIsEditingTab,
    setCurrentTab,
    currentTab,
  } = useLayoutEditor();

  const { tabOptions } = useVuex(() => ({
    tabOptions: Object.keys(LayoutService.state.tabs).map(tab => ({
      value: tab,
      label: LayoutService.state.tabs[tab].name,
      image: <i className={LayoutService.state.tabs[tab].icon} />,
    })),
  }));

  function openModal(isEditing: boolean) {
    setIsEditingTab(isEditing);
    setShowModal(true);
  }

  async function removeCurrentTab() {
    if (currentTab === 'default') return;
    await LayoutService.actions.return.removeCurrentTab();
    setCurrentTab('default');
  }

  async function save() {
    if (currentLayout !== LayoutService.views.currentTab.currentLayout) {
      await LayoutService.actions.return.changeLayout(currentLayout);
    }
    if (dockLayout !== LayoutService.views.currentTab.dockLayout) {
      await LayoutService.actions.return.setDockLayout(dockLayout);
    }
    await LayoutService.actions.return.setSlots(slottedElements);
    LayoutService.actions.recordLayoutEditorUsage();
    if (browserUrl && slottedElements[ELayoutElement.Browser]) {
      await LayoutService.actions.return.setUrl(browserUrl);
    }
    NavMenuService.actions.setCurrentMenuItem(ENavMenuKey.Editor);
    NavigationService.actions.navigate('Studio');
  }

  return (
    <Form className={styles.topBar}>
      <ListInput
        className={styles.layoutSelect}
        label={$t('Current Layout')}
        value={currentTab}
        onChange={setCurrentTab}
        options={tabOptions}
        hasImage
      />
      {currentTab !== 'default' && (
        <>
          <Tooltip title={$t('Edit Layout')} placement="bottom">
            <button
              className={cx('button button--default', styles.iconButton)}
              onClick={() => openModal(true)}
            >
              <i className="icon-edit" />
            </button>
          </Tooltip>
          <Tooltip title={$t('Delete Layout')} placement="bottom">
            <button
              className={cx('button button--warn', styles.iconButton)}
              onClick={removeCurrentTab}
            >
              <i className="icon-trash" />
            </button>
          </Tooltip>
        </>
      )}
      <button
        className="button button--action"
        style={{ margin: '0 16px' }}
        onClick={() => openModal(false)}
      >
        {$t('Add Layout')}
      </button>
      <button className="button button--action" onClick={save}>
        {$t('Save Changes')}
      </button>
    </Form>
  );
}
