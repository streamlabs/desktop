import React from 'react';
import { Button, Menu, Tooltip } from 'antd';
import { PlusOutlined, SettingOutlined, CaretRightOutlined } from '@ant-design/icons';
import { CheckboxInput } from 'components-react/shared/inputs';
import { $t } from 'services/i18n';
import css from './ReactiveWidgetMenu.m.less';

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
  toggleTrigger: (group: any, triggerId: string, enabled: boolean) => void;
  deleteTrigger: (triggerId: string) => void;
}) {
  const { menuItems, activeKey, keyMap, onChange, playAlert, toggleTrigger, deleteTrigger } = props;

  return (
    <Menu
      mode="inline"
      theme="dark"
      selectedKeys={[activeKey]}
      defaultOpenKeys={['global']}
      onClick={({ key }) => onChange(key as any)}
    >
      <Menu.Item

        key="add-trigger"
        icon={<PlusOutlined />}
        style={{ height: '45px', lineHeight: '45px' }}
      >
        {$t('Add a new trigger')}
      </Menu.Item>

      <Menu.Item key="general" style={{ height: '45px', lineHeight: '45px' }}>
        {$t('Game Settings')}
      </Menu.Item>
      {Object.entries(menuItems).map(([groupKey, group]) => (
        <Menu.SubMenu
          key={groupKey}
          icon={<GameIcon />}
          title={keyMap[groupKey]?.title || groupKey}
        >
          {(group as any).triggers?.map((trigger: any, index: number) => (
            // TODO$chris: consider just using trigger.id
            <Menu.Item
              key={`${groupKey}-trigger-${trigger.id}`}
              style={{ height: '45px', lineHeight: '45px' }}
            >
              <div style={{ display: 'flex' }}>
                <CheckboxInput
                  value={trigger.enabled}
                  onChange={enabled => toggleTrigger(groupKey, trigger.id, enabled)}
                  style={{ display: 'inline-block' }}
                />
                <div style={{ display: 'flex', width: '100%', overflow: 'hidden' }}>
                  <div className={css.triggerTitle}>
                    {trigger.name || `Trigger ${index + 1}`}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                    <Tooltip title={$t('Delete Trigger')} placement="left" mouseLeaveDelay={0}>
                      <Button
                        onClick={e => {
                          e.stopPropagation();
                          deleteTrigger(trigger.id);
                        }}
                        type={'text'}
                        style={{ padding: '4.4px 0', width: '16px', color: 'var(--red)' }}
                      >
                        <i className="icon-trash" style={{ fontSize: '16px' }} />
                      </Button>
                    </Tooltip>
                    <Tooltip title={$t('Play Alert')} placement="left" mouseLeaveDelay={0}>
                      <Button
                        onClick={e => {
                          e.stopPropagation();
                          playAlert(trigger);
                        }}
                        type={'text'}
                        icon={<CaretRightOutlined style={{ fontSize: '24px', color: 'white' }} />}
                      />
                    </Tooltip>
                  </div>
                </div>
              </div>
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
