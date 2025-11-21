import React from 'react';
import { Button, Menu, Tooltip } from 'antd';
import { PlusOutlined, SettingOutlined, CaretRightOutlined } from '@ant-design/icons';
import { CheckboxInput } from 'components-react/shared/inputs';
import { $t } from '../../../services/i18n';

export function GameIcon() {
  return (
    <i className="icon-console ant-menu-item-icon" style={{ fontSize: 16, lineHeight: '16px' }} />
  );
}

export function ReactiveWidgetMenu(props: {
  menuItems: any;
  keyMap: any;
  activeKey: any;
  onChange: (key: string) => void;
  playAlert: (type: any) => void;
}) {
  const { menuItems, activeKey, keyMap, onChange, playAlert } = props;

  return (
    <Menu
      mode="inline"
      theme="dark"
      selectedKeys={[activeKey]}
      defaultOpenKeys={['global']}
      onClick={({ key }) => onChange(key as any)}
    >
      <Menu.Item key="add-trigger" icon={<PlusOutlined />}>
        {$t('Add a new trigger')}
      </Menu.Item>

      <Menu.Item key="general">{$t('Game Settings')}</Menu.Item>
      {Object.entries(menuItems).map(([groupKey, group]) => (
        <Menu.SubMenu
          key={groupKey}
          icon={<GameIcon />}
          title={keyMap[groupKey]?.title || groupKey}
        >
          {(group as any).triggers?.map((trigger: any, index: number) => (
            // TODO$chris: consider just using trigger.id
            <Menu.Item key={`${groupKey}-trigger-${trigger.id}`}>
              <CheckboxInput value={trigger.enabled} style={{ display: 'inline-block' }} />
              {trigger.name || `Trigger ${index + 1}`}
              {/* TODO$chris: add delete trigger button */}
              <Tooltip title={$t('Play Alert')} placement="left" mouseLeaveDelay={0}>
                <Button
                  onClick={e => {
                    e.stopPropagation();
                    playAlert(trigger);
                  }}
                  type={'text'}
                  style={{ position: 'absolute', right: '16px', top: '8px' }}
                  icon={<CaretRightOutlined style={{ fontSize: '24px', color: 'white' }} />}
                />
              </Tooltip>
            </Menu.Item>
          ))}
          <Menu.Item key={`${groupKey}-manage-trigger`} icon={<SettingOutlined />}>
            {$t('Manage Triggers')}
          </Menu.Item>
        </Menu.SubMenu>
      ))}
    </Menu>
  );
}
