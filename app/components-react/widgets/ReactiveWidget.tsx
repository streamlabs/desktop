import React from 'react';
import { WidgetLayout } from './common/WidgetLayout';
import { useReactiveWidget } from './reactive-widget/useReactiveWidget';
import { ReactiveWidgetMenu } from './reactive-widget/ReactiveWidgetMenu';
import { ReactiveWidgetCreateTriggerForm } from './reactive-widget/ReactiveWidgetCreateTriggerForm';
import { ReactiveWidgetGameSettings } from './reactive-widget/ReactiveWidgetGameSettings';

function onSubmit(values: any) {
  console.log('TODO: Submitting new trigger:', values);
}

const AddTriggerTab: React.FC = () => {
  const { availableGameEvents, gameEvents, globalEvents, games } = useReactiveWidget();

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
      onSubmit={onSubmit}
    />
  );
};

const GameSettingsTab: React.FC = () => {
  const { data, games: gamesMeta } = useReactiveWidget();
  const games = Object.entries((data as any)?.settings?.games || {}).map(([gameId, gameData]) => {
    return {
      id: gameId,
      label: gamesMeta[gameId]?.title || gameId,
      enabled: (gameData as any)?.enabled || false,
    };
  });
  const global = {
    id: 'global',
    label: 'Global',
    enabled: (data as any)?.settings?.global?.enabled || false,
  };

  function onToggleGame(gameId: string, enabled: boolean) {
    // TODO$chris
    console.log('TODO: Toggle game:', gameId, enabled);
  }
  return (
    <div style={{ marginBottom: '24px' }}>
      <ReactiveWidgetGameSettings options={[global, ...games]} onToggleGame={onToggleGame} />
    </div>
  );
};

const ManageTriggersTab: React.FC = () => <div style={{ padding: 0 }}>Manage Triggers</div>;

type TabKey = 'add-trigger' | 'general' | 'manage-triggers';
const TAB_COMPONENTS: Record<TabKey, React.FC> = {
  'add-trigger': AddTriggerTab,
  general: GameSettingsTab,
  'manage-triggers': ManageTriggersTab,
};
const tabKeys: TabKey[] = ['add-trigger', 'general', 'manage-triggers'];

function getActiveTabKey(selectedTab: string): TabKey {
  return (tabKeys as TabKey[]).includes(selectedTab as TabKey)
    ? (selectedTab as TabKey)
    : 'manage-triggers';
}

export function ReactiveWidget() {
  const {
    selectedTab,
    setSelectedTab,
    playReactiveAlert,
    triggerGroups,
    games,
  } = useReactiveWidget();
  const activeKey: TabKey = getActiveTabKey(selectedTab);
  const ActiveTab = TAB_COMPONENTS[activeKey];
  const keyMap = {
    global: { title: 'Global', camel: 'global' },
    ...games,
  };
  const showDisplay = activeKey !== 'general';
  return (
    <WidgetLayout layout="long-menu" showDisplay={showDisplay}>
      <ReactiveWidgetMenu
        menuItems={triggerGroups}
        keyMap={keyMap}
        activeKey={selectedTab}
        onChange={key => setSelectedTab(key)}
        playAlert={trigger => playReactiveAlert(trigger)}
      />
      <ActiveTab />
    </WidgetLayout>
  );
}
