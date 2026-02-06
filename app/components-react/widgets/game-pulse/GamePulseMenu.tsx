import React, { useEffect, useState } from 'react';
import { Button, Menu, Tooltip } from 'antd';
import { PlusOutlined, SettingOutlined, CaretRightOutlined } from '@ant-design/icons';
import { CheckboxInput } from 'components-react/shared/inputs';
import { $t } from 'services/i18n';
import css from './GamePulseMenu.m.less';
import { GamePulseTabUtils } from './GamePulse.helpers';
import { GamePulseTrigger } from './GamePulse.types';

function GameIcon() {
  return <i className={`icon-console ant-menu-item-icon ${css.gameIcon}`} />;
}

interface ReactiveSection {
  id: string; // The game key (e.g. 'global', 'csgo')
  title: string; // The display title
  triggers: GamePulseTrigger[];
}

export function GamePulseMenu(props: {
  sections: ReactiveSection[];
  activeKey: string;
  onChange: (params: string) => void;
  playAlert: (game: string, type: GamePulseTrigger) => void;
  toggleTrigger: (group: string, triggerId: string, enabled: boolean) => void;
  deleteTrigger: (triggerId: string, scopeId: string) => void;
}) {
  const {
    sections,
    activeKey,
    onChange,
    playAlert,
    toggleTrigger,
    deleteTrigger,
  } = props;

  const [openKeys, setOpenKeys] = useState<string[]>(['global']);

  function onDelete(event: React.MouseEvent, triggerId: string, scopeId: string) {
    event.stopPropagation();
    deleteTrigger(triggerId, scopeId);
  }

  function onPlayAlert(event: React.MouseEvent, gameKey: string, trigger: GamePulseTrigger) {
    event.stopPropagation();
    playAlert(gameKey, trigger);
  }

  useEffect(() => {
    const { gameId } = GamePulseTabUtils.parse(activeKey);

    if (gameId) {
      setOpenKeys(prev => {
        if (prev.includes(gameId!)) return prev;
        return [...prev, gameId!];
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
      className={css.gamePulseMenu}
    >
      <Menu.Item
        key={GamePulseTabUtils.ID_ADD_TRIGGER}
        icon={<PlusOutlined />}
        className={css.menuItem}
      >
        {$t('Add a new trigger')}
      </Menu.Item>

      {sections.map((section) => (
        <Menu.SubMenu
          key={section.id}
          icon={<GameIcon />}
          title={section.title}
        >
          {section.triggers?.map((trigger, index) => (
            <Menu.Item
              key={GamePulseTabUtils.generateTriggerId(section.id, trigger.id)}
              className={css.menuItem}
            >
              <div className={css.triggerRow}>
                <div onClick={e => e.stopPropagation()}>
                  <CheckboxInput
                    value={trigger.enabled}
                    onChange={enabled => toggleTrigger(section.id, trigger.id, enabled)}
                    className={css.triggerCheckbox}
                  />
                </div>
                <div className={css.triggerMain}>
                  <div className={css.triggerTitle}>{trigger.name}</div>
                  <div className={css.triggerActions}>
                    <Tooltip title={$t('Delete Trigger')} placement="top" mouseLeaveDelay={0}>
                      <Button
                        onClick={e => onDelete(e, trigger.id, section.id)}
                        type="text"
                        className={css.deleteButton}
                      >
                        <i className={`icon-trash ${css.deleteIcon}`} />
                      </Button>
                    </Tooltip>
                    <Tooltip title={$t('Play Alert')} placement="top" mouseLeaveDelay={0}>
                      <Button
                        onClick={e => onPlayAlert(e, section.id, trigger)}
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
            key={GamePulseTabUtils.generateManageGameId(section.id)}
            icon={<SettingOutlined />}
          >
            {$t('Manage Triggers')}
          </Menu.Item>
        </Menu.SubMenu>
      ))}
      <Menu.Item key={GamePulseTabUtils.ID_GENERAL} className={css.menuItem}>
        {$t('Game Settings')}
      </Menu.Item>

    </Menu>
  );
}
