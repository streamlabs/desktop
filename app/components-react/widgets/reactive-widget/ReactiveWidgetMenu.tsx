import React, { useEffect, useState } from 'react';
import { Button, Menu, Tooltip } from 'antd';
import { PlusOutlined, SettingOutlined, CaretRightOutlined } from '@ant-design/icons';
import { CheckboxInput } from 'components-react/shared/inputs';
import { $t } from 'services/i18n';
import css from './ReactiveWidgetMenu.m.less';
import { ReactiveTabUtils } from './ReactiveWidget.helpers';

function GameIcon() {
  return <i className={`icon-console ant-menu-item-icon ${css.gameIcon}`} />;
}

export function ReactiveWidgetMenu(props: {
  menuItems: any;
  groupMeta: any;
  activeKey: string;
  onChange: (params: any) => void;
  playAlert: (game: any, type: any) => void;
  toggleTrigger: (group: any, triggerId: string, enabled: boolean) => void;
  deleteTrigger: (triggerId: string) => void;
}) {
  const {
    menuItems,
    activeKey,
    groupMeta,
    onChange,
    playAlert,
    toggleTrigger,
    deleteTrigger,
  } = props;

  const [openKeys, setOpenKeys] = useState<string[]>(['global']);

  useEffect(() => {
    const context = ReactiveTabUtils.parse(activeKey);

    if (context.gameId) {
      setOpenKeys(prev => {
        if (prev.includes(context.gameId!)) return prev;
        return [...prev, context.gameId!];
      });
    }
  }, [activeKey]);

  return (
    <Menu
      mode="inline"
      theme="dark"
      selectedKeys={[activeKey]}
      openKeys={openKeys}
      onOpenChange={keys => setOpenKeys(keys as string[])}
      onClick={({ key }) => onChange(key)}
    >
      <Menu.Item
        key={ReactiveTabUtils.ID_ADD_TRIGGER}
        icon={<PlusOutlined />}
        className={css.menuItem}
      >
        {$t('Add a new trigger')}
      </Menu.Item>

      <Menu.Item key={ReactiveTabUtils.ID_GENERAL} className={css.menuItem}>
        {$t('Game Settings')}
      </Menu.Item>

      {Object.entries(menuItems).map(([groupKey, group]) => (
        <Menu.SubMenu
          key={groupKey}
          icon={<GameIcon />}
          title={groupMeta[groupKey]?.title || groupKey}
        >
          {(group as any).triggers?.map((trigger: any, index: number) => (
            <Menu.Item
              key={ReactiveTabUtils.generateTriggerId(groupKey, trigger.id)}
              className={css.menuItem}
            >
              <div className={css.triggerRow}>
                <CheckboxInput
                  value={trigger.enabled}
                  onChange={enabled => toggleTrigger(groupKey, trigger.id, enabled)}
                  className={css.triggerCheckbox}
                />
                <div className={css.triggerMain}>
                  <div className={css.triggerTitle}>{trigger.name || `Trigger ${index + 1}`}</div>
                  <div className={css.triggerActions}>
                    <Tooltip title={$t('Delete Trigger')} placement="top" mouseLeaveDelay={0}>
                      <Button
                        onClick={e => {
                          e.stopPropagation();
                          deleteTrigger(trigger.id);
                        }}
                        type="text"
                        className={css.deleteButton}
                      >
                        <i className={`icon-trash ${css.deleteIcon}`} />
                      </Button>
                    </Tooltip>
                    <Tooltip title={$t('Play Alert')} placement="top" mouseLeaveDelay={0}>
                      <Button
                        onClick={e => {
                          e.stopPropagation();
                          playAlert(groupKey, trigger);
                        }}
                        type="text"
                        icon={<CaretRightOutlined className={css.playIcon} />}
                      />
                    </Tooltip>
                  </div>
                </div>
              </div>
            </Menu.Item>
          ))}
          <Menu.Item
            key={ReactiveTabUtils.generateManageGameId(groupKey)}
            icon={<SettingOutlined />}
          >
            {$t('Manage Triggers')}
          </Menu.Item>
        </Menu.SubMenu>
      ))}
    </Menu>
  );
}
