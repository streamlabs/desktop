import { Button, Col, Collapse, Layout, Row, Spin } from 'antd';
import React, { ReactNode } from 'react';
import { useWidget } from './useWidget';
import Display from '../../shared/Display';
import css from './WidgetLayout.m.less';
import Form, { useForm } from '../../shared/inputs/Form';
import { ObsForm } from '../../obs/ObsForm';
import { $t } from '../../../services/i18n';
import { CustomCodeSection } from './CustomCode';
import { CustomFieldsSection } from './CustomFields';
import { RollbackOutlined } from '@ant-design/icons';
import { assertIsDefined } from '../../../util/properties-type-guards';
const { Content, Header, Sider } = Layout;

type TWidgetLayoutType = 'basic' | 'long-menu';
type TLayoutChildren = ReactNode | [ReactNode, ReactNode];

const MENU_WIDTH = 270;
const PREVIEW_HEIGHT = 250;

/**
 * A layout component for all widgets
 * If "basic" layout selected then display 1 column or 2 columns depending
 * on how many children have been provided to props
 */
export function WidgetLayout(p: { layout?: TWidgetLayoutType; children: TLayoutChildren }) {
  const layout = p.layout || 'basic';
  switch (layout) {
    case 'basic':
      return <BasicLayout>{p.children}</BasicLayout>;
    case 'long-menu':
      return <LongMenuLayout>{p.children}</LongMenuLayout>;
  }
}

function BasicLayout(p: { children: TLayoutChildren }) {
  const { isLoading } = useWidget();
  const { MenuPanel, ContentPanel } = getLayoutPanels(p.children);
  return (
    <Layout className={css.widgetLayout}>
      <Header style={{ padding: 0, height: `${PREVIEW_HEIGHT}px` }}>
        <ModalDisplay />
      </Header>
      <Content>
        <Row style={{ height: '100%', borderTop: '1px solid var(--border)' }}>
          {MenuPanel && <Col className={css.menuWrapper}>{!isLoading && MenuPanel}</Col>}
          <Col flex="auto" className={css.contentWrapper}>
            <ModalContent>{ContentPanel}</ModalContent>
          </Col>
        </Row>
      </Content>
      <ModalFooter />
    </Layout>
  );
}

function LongMenuLayout(p: { children: TLayoutChildren }) {
  const { isLoading } = useWidget();
  const { MenuPanel, ContentPanel } = getLayoutPanels(p.children);
  const wrapperStyle = {
    height: `calc(100% - ${PREVIEW_HEIGHT}px)`,
    borderTop: '1px solid var(--border)',
  };
  assertIsDefined(MenuPanel);

  return (
    <Layout className={css.widgetLayout}>
      <Layout>
        <Sider className={css.menuWrapper} width={MENU_WIDTH}>
          {!isLoading && MenuPanel}
        </Sider>
        <Content>
          <ModalDisplay />
          <div className={css.contentWrapper} style={wrapperStyle}>
            <ModalContent>{ContentPanel}</ModalContent>
          </div>
        </Content>
      </Layout>
      <ModalFooter />
    </Layout>
  );
}

function ModalContent(p: { children: ReactNode }) {
  const ContentPanel = p.children;
  const { isLoading, selectedTab, config, hasCustomFields } = useWidget();
  const form = useForm();
  return (
    <Form form={form} layout="horizontal">
      <Spin spinning={isLoading}>
        {!isLoading && (
          <>
            {/* SETTINGS FORM  */}
            {ContentPanel}

            {/* BROWSER SOURCE SETTINGS  */}
            {selectedTab === 'general' && <BrowserSourceSettings />}

            {/* CUSTOM CODE  */}
            {config.customCodeAllowed && <CustomCodeSection />}

            {/* CUSTOM FIELDS  */}
            {hasCustomFields && <CustomFieldsSection />}
          </>
        )}
      </Spin>
    </Form>
  );
}

function ModalFooter() {
  const { canRevert, revertChanges, openWebSettings, close } = useWidget();
  return (
    <div className="ant-modal-footer" style={{ display: 'flex', alignItems: 'stretch', gap: '16px' }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'stretch', justifyContent: 'flex-start', gap: '16px' }}>
        <Button onClick={openWebSettings} type="ghost">
          <i className="icon-pop-out-2" style={{ marginRight: '8px' }} />
          {$t('Manage on Web')}
        </Button>
        {canRevert && (
          <Button onClick={revertChanges} type="ghost">
            <RollbackOutlined />
            {$t('Revert Changes')}
          </Button>
        )}
      </div>
      <Button onClick={close}>{$t('Close')}</Button>
    </div>
  );
}

function ModalDisplay() {
  const { previewSourceId, isLoading } = useWidget();
  return (
    <div style={{ height: `${PREVIEW_HEIGHT}px`, backgroundColor: 'var(--section)' }}>
      {!isLoading && <Display sourceId={previewSourceId} />}
    </div>
  );
}

/**
 * Renders a collapsible section with browser source settings for the widget
 */
function BrowserSourceSettings() {
  const { browserSourceProps, updateBrowserSourceProps } = useWidget();
  return (
    <>
      <Collapse bordered={false}>
        <Collapse.Panel header={$t('Browser Settings')} key={1}>
          <ObsForm
            value={browserSourceProps}
            onChange={updateBrowserSourceProps}
            layout="horizontal"
          />
        </Collapse.Panel>
      </Collapse>
    </>
  );
}

function getLayoutPanels(layoutChildren: TLayoutChildren) {
  let MenuPanel: ReactNode | null;
  let ContentPanel: ReactNode;

  // check if MenuPanel is defined
  if (Array.isArray(layoutChildren)) {
    [MenuPanel, ContentPanel] = layoutChildren;
  } else {
    [MenuPanel, ContentPanel] = [null, layoutChildren];
  }
  return { MenuPanel, ContentPanel };
}
