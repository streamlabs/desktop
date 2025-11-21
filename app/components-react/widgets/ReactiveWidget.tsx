import React from 'react';
import { WidgetLayout } from './common/WidgetLayout';
import { useReactiveWidget } from './reactive-widget/useReactiveWidget';
import { ReactiveWidgetMenu } from './reactive-widget/ReactiveWidgetMenu';
import { ReactiveWidgetCreateTriggerForm } from './reactive-widget/ReactiveWidgetCreateTriggerForm';
import { ReactiveWidgetGameSettings } from './reactive-widget/ReactiveWidgetGameSettings';
import { ReactiveWidgetTriggerDetails } from './reactive-widget/ReactiveWidgetTriggerDetails';
import css from './reactive-widget/ReactiveWidget.m.less';

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
      name: gamesMeta[gameId]?.title || gameId,
      enabled: (gameData as any)?.enabled || false,
    };
  });
  const global = {
    id: 'global',
    name: 'Global',
    enabled: (data as any)?.settings?.global?.enabled || false,
  };

  function onToggleGame(gameId: string, enabled: boolean) {
    // TODO$chris
    console.log('TODO: Toggle game:', gameId, enabled);
  }
  return (
    <div>
      <ReactiveWidgetGameSettings options={[global, ...games]} onToggleGame={onToggleGame} />
      <hr style={{ margin: '24px 0', opacity: 0.2 }} />
    </div>
  );
};

const ManageTriggersTab: React.FC = () => {
  const { selectedTab, data, games: gamesMeta } = useReactiveWidget();
  const selectedGame = selectedTab.split('-manage-trigger')[0];
  console.log({ selectedTab, selectedGame, data, gamesMeta });
  function onToggleGame(gameId: string, enabled: boolean) {
    // TODO$chris
    console.log('TODO: Toggle game:', gameId, enabled);
  }

  const options = selectedGame === 'global' ? (data as any)?.settings?.global?.triggers : (data as any)?.settings?.games?.[selectedGame]?.triggers;
  return <ReactiveWidgetGameSettings options={options} onToggleGame={onToggleGame} />;
};

const TriggerDetails: React.FC = () => {
  const { selectedTab, data, staticConfig } = useReactiveWidget();
  console.log({ staticConfig })
  const selectedGame = selectedTab.split('-trigger-')[0];
  const selectedTriggerId = selectedTab.split('-trigger-')[1];
  function onUpdate(payload: any) {
    // TODO$chris
    console.log('TODO: Update trigger:', payload);
  }
  const trigger = selectedGame === 'global'
    ? (data as any)?.settings?.global?.triggers?.find((t: any) => t.id === selectedTriggerId)
    : (data as any)?.settings?.games?.[selectedGame]?.triggers?.find((t: any) => t.id === selectedTriggerId);
  return (
    <ReactiveWidgetTriggerDetails trigger={trigger} onUpdate={onUpdate} staticConfig={staticConfig} />
  );
};

type TabKind = 'add-trigger' | 'general' | 'game-manage-trigger' | 'trigger-detail';

const TAB_COMPONENTS: Record<TabKind, React.FC> = {
  'add-trigger': AddTriggerTab,
  general: GameSettingsTab,
  'game-manage-trigger': ManageTriggersTab,
  'trigger-detail': TriggerDetails,
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

export function ReactiveWidget() {
  const {
    selectedTab,
    setSelectedTab,
    playReactiveAlert,
    triggerGroups,
    games,
  } = useReactiveWidget();

  const tabKind = getTabKind(selectedTab);
  const ActiveTab = TAB_COMPONENTS[tabKind];

  const keyMap = {
    global: { title: 'Global', camel: 'global' },
    ...games,
  };

  const showDisplay = tabKind !== 'general' && tabKind !== 'game-manage-trigger';

  return (
    <div className={css.reactiveWidget}>
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
    </div>
  );
}
