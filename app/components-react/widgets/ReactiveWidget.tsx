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
  const {
    data,
    games: gamesMeta,
    setGroupEnabled,
    enableAllGroups,
    disableAllGroups,
  } = useReactiveWidget();

  const games = Object.entries((data as any)?.settings?.games || {}).map(
    ([gameId, gameData]) => {
      return {
        id: gameId,
        name: gamesMeta[gameId]?.title || gameId,
        enabled: (gameData as any)?.enabled || false,
      };
    },
  );

  const global = {
    id: 'global',
    name: 'Global',
    enabled: (data as any)?.settings?.global?.enabled || false,
  };

  return (
    <div>
      <ReactiveWidgetGameSettings
        options={[global, ...games]}
        onToggleGame={setGroupEnabled}
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
      onToggleGame={onToggleGame}
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

function getTabKind(selectedTab: string): TabKind {
  if (selectedTab === 'add-trigger') return 'add-trigger';
  if (selectedTab === 'general') return 'general';
  if (selectedTab.endsWith('-manage-trigger')) {
    return 'game-manage-trigger';
  }
  if (selectedTab.includes('-trigger-')) {
    return 'trigger-detail';
  }

  return 'game-manage-trigger';
}

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
    games,
    data,
    updateSettings,
    deleteTrigger,
  } = useReactiveWidget();

  const tabKind = getTabKind(selectedTab);
  const ActiveTab = TAB_COMPONENTS[tabKind];

  const keyMap = {
    global: { title: 'Global', camel: 'global' },
    ...games,
  };

  const showDisplay = tabKind !== 'general' && tabKind !== 'game-manage-trigger';
  function onPlayAlert(trigger: any) {
    // if active tab is not the trigger detail, switch to it first
    if (tabKind !== 'trigger-detail') {
      const gameKey = trigger.game || 'global';
      setSelectedTab(`${gameKey}-trigger-${trigger.id}`);
    }
    playReactiveAlert(trigger);
  }

  function toggleTrigger(group: any, triggerId: string, enabled: boolean) {
    const newSettings = { ...((data as any)?.settings || {}) };
    if (group === 'global') {
      newSettings.global = {
        ...newSettings.global,
        triggers: (newSettings.global?.triggers || []).map((trigger: any) => ({
          ...trigger,
          enabled: trigger.id === triggerId ? enabled : trigger.enabled,
        })),
      };
    } else {
      newSettings.games = {
        ...newSettings.games,
        [group]: {
          ...newSettings.games?.[group],
          triggers: (newSettings.games?.[group]?.triggers || []).map((trigger: any) => ({
            ...trigger,
            enabled: trigger.id === triggerId ? enabled : trigger.enabled,
          })),
        },
      };
    }
    updateSettings(newSettings);
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
          keyMap={keyMap}
          activeKey={selectedTab}
          onChange={key => setSelectedTab(key)}
          playAlert={trigger => onPlayAlert(trigger)}
          toggleTrigger={toggleTrigger}
          deleteTrigger={onDelete}
        />
        <ActiveTab />
      </WidgetLayout>
    </div>
  );
}
