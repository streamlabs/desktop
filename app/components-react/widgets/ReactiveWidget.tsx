import React from 'react';
import * as remote from '@electron/remote';
import { WidgetLayout } from './common/WidgetLayout';
import { useReactiveWidget } from './reactive-widget/useReactiveWidget';
import { ReactiveWidgetMenu } from './reactive-widget/ReactiveWidgetMenu';
import { ReactiveWidgetCreateTriggerForm } from './reactive-widget/ReactiveWidgetCreateTriggerForm';
import { ReactiveWidgetGameSettings } from './reactive-widget/ReactiveWidgetGameSettings';
import { ReactiveWidgetTriggerDetails } from './reactive-widget/ReactiveWidgetTriggerDetails';
import css from './reactive-widget/ReactiveWidget.m.less';
import { useForceUpdate } from 'slap';
import { $t } from 'services/i18n/i18n';
import { Button } from 'antd';

const AddTriggerTab: React.FC = () => {
  const {
    availableGameEvents,
    gameEvents,
    globalEvents,
    games,
    data,
    createTrigger,
  } = useReactiveWidget();

  const gameOptions = [
    { label: 'Global', value: 'global' },
    ...Object.entries(games).map(([key, value]) => ({ label: value.title, value: key })),
  ];

  return (
    <ReactiveWidgetCreateTriggerForm
      trigger={{ game: '', event_type: '', name: '' }}
      availableGameEvents={availableGameEvents}
      gameEvents={gameEvents}
      globalEvents={globalEvents}
      gameOptions={gameOptions}
      data={data}
      onSubmit={createTrigger}
    />
  );
};

const GameSettingsTab: React.FC = () => {
  const { groupOptions, setGroupEnabled, enableAllGroups, disableAllGroups } = useReactiveWidget();

  return (
    <div>
      <ReactiveWidgetGameSettings
        options={groupOptions}
        onChangeGroupEnabled={setGroupEnabled}
        onEnableAll={enableAllGroups}
        onDisableAll={disableAllGroups}
      />
      <hr style={{ margin: '24px 0', opacity: 0.2 }} />
    </div>
  );
};

const ManageTriggersTab: React.FC = () => {
  const {
    selectedTab,
    data,
    enableAllTriggers,
    disableAllTriggers,
    toggleTrigger,
  } = useReactiveWidget();
  const selectedGame = selectedTab.split('-manage-trigger')[0];

  function onToggleGame(triggerId: string, enabled: boolean) {
    toggleTrigger(selectedGame, triggerId, enabled);
  }

  function onEnableAll() {
    enableAllTriggers(selectedGame);
  }

  function onDisableAll() {
    disableAllTriggers(selectedGame);
  }

  const options =
    selectedGame === 'global'
      ? (data as any)?.settings?.global?.triggers
      : (data as any)?.settings?.games?.[selectedGame]?.triggers;
  return (
    <ReactiveWidgetGameSettings
      options={options}
      onChangeGroupEnabled={onToggleGame}
      onEnableAll={onEnableAll}
      onDisableAll={onDisableAll}
    />
  );
};

const TriggerDetailsTab: React.FC = () => {
  const { selectedTab, staticConfig, createTriggerBinding } = useReactiveWidget();
  const forceUpdate = useForceUpdate();

  const [selectedGame, selectedTriggerId] = React.useMemo(() => {
    const [game, triggerId] = selectedTab.split('-trigger-');
    return [game, triggerId];
  }, [selectedTab]);

  const binding = React.useMemo(() => {
    if (!selectedGame || !selectedTriggerId || !createTriggerBinding) return null;
    return createTriggerBinding(selectedGame, selectedTriggerId, forceUpdate);
  }, [createTriggerBinding, selectedGame, selectedTriggerId, forceUpdate]);

  const trigger = binding?.trigger;

  if (!trigger) {
    return null;
  }

  function handleUpdate(updatedTrigger: any) {
    binding?.updateTrigger(updatedTrigger);
  }

  return (
    <ReactiveWidgetTriggerDetails
      key={trigger.id}
      trigger={trigger}
      onUpdate={handleUpdate}
      staticConfig={staticConfig}
    />
  );
};

type TabKind = 'add-trigger' | 'general' | 'game-manage-trigger' | 'trigger-detail';

const TAB_COMPONENTS: Record<TabKind, React.FC> = {
  'add-trigger': AddTriggerTab,
  general: GameSettingsTab,
  'game-manage-trigger': ManageTriggersTab,
  'trigger-detail': TriggerDetailsTab,
};

function ManageOnWebButton() {
  const handleClick = () => {
    remote.shell.openExternal('https://streamlabs.com/dashboard#/widgets/reactive-widget');
  };
  return (
    <Button type="ghost" onClick={handleClick}>
      <i className="icon-pop-out-2" style={{ marginRight: 8 }} />
      {$t('Manage on Web')}
    </Button>
  );
}

export function ReactiveWidget() {
  const {
    selectedTab,
    setSelectedTab,
    playReactiveAlert,
    triggerGroups,
    groupMeta,
    toggleTrigger,
    deleteTrigger,
    tabKind,
  } = useReactiveWidget();

  const ActiveTab = TAB_COMPONENTS[tabKind];

  const showDisplay = tabKind !== 'general' && tabKind !== 'game-manage-trigger';

  function onPlayAlert(trigger: any) {
    // if active tab is not the trigger detail, switch to it first
    if (tabKind !== 'trigger-detail') {
      const gameKey = trigger.game || 'global';
      setSelectedTab(`${gameKey}-trigger-${trigger.id}`);
    }
    playReactiveAlert(trigger);
  }

  function onDelete(triggerId: string) {
    remote.dialog
      .showMessageBox(remote.getCurrentWindow(), {
        title: 'Streamlabs Desktop',
        message: $t('Are you sure you want to delete this trigger? This action cannot be undone.'),
        buttons: [$t('Cancel'), $t('OK')],
      })
      .then(({ response }) => {
        if (!response) return;
        deleteTrigger(triggerId);
      });
  }

  return (
    <div className={css.reactiveWidget}>
      <WidgetLayout
        layout="long-menu"
        showDisplay={showDisplay}
        footerSlots={<ManageOnWebButton />}
      >
        <ReactiveWidgetMenu
          menuItems={triggerGroups}
          groupMeta={groupMeta}
          activeKey={selectedTab}
          onChange={key => setSelectedTab(key)}
          playAlert={onPlayAlert}
          toggleTrigger={toggleTrigger}
          deleteTrigger={onDelete}
        />
        <ActiveTab />
      </WidgetLayout>
    </div>
  );
}
