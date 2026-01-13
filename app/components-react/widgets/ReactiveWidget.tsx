import React, { useMemo, useCallback } from 'react';
import * as remote from '@electron/remote';
import { WidgetLayout } from './common/WidgetLayout';
import { useReactiveWidget } from './reactive-widget/useReactiveWidget';
import { ReactiveTabUtils, sanitizeTrigger } from './reactive-widget/ReactiveWidget.helpers';
import { TabKind, ReactiveTrigger } from './reactive-widget/ReactiveWidget.types';
import { ReactiveWidgetMenu } from './reactive-widget/ReactiveWidgetMenu';
import { ReactiveWidgetCreateTriggerForm } from './reactive-widget/ReactiveWidgetCreateTriggerForm';
import { ReactiveWidgetGameSettings } from './reactive-widget/ReactiveWidgetGameSettings';
import { ReactiveWidgetTriggerDetails } from './reactive-widget/ReactiveWidgetTriggerDetails';
import css from './reactive-widget/ReactiveWidget.m.less';
import { useForceUpdate } from 'slap';
import { $t } from 'services/i18n/i18n';
import { Button } from 'antd';

export function ReactiveWidget() {
  const {
    selectedTab,
    setSelectedTab,
    playReactiveAlert,
    sections,
    toggleTrigger,
    deleteTrigger,
    tabKind,
  } = useReactiveWidget();

  const TAB_COMPONENTS: Record<TabKind, React.FC> = {
    [TabKind.AddTrigger]: AddTriggerTab,
    [TabKind.General]: GameSettingsTab,
    [TabKind.GameManage]: ManageTriggersTab,
    [TabKind.TriggerDetail]: TriggerDetailsTab,
  };

  const ActiveTab = TAB_COMPONENTS[tabKind] || GameSettingsTab;

  const showDisplay = tabKind !== TabKind.General && tabKind !== TabKind.GameManage;

  function onPlayAlert(gameKey: string = 'global', trigger: ReactiveTrigger) {
    if (!trigger?.id) return;

    const targetTab = ReactiveTabUtils.generateTriggerId(gameKey, trigger.id);

    if (selectedTab !== targetTab) {
      setSelectedTab(targetTab);
    }

    const cleanTrigger = sanitizeTrigger(trigger);
    playReactiveAlert(cleanTrigger);
  }

  function onDelete(triggerId: string, scopeId: string) {
    remote.dialog
      .showMessageBox(remote.getCurrentWindow(), {
        title: 'Streamlabs Desktop',
        message: $t('Are you sure you want to delete this trigger?'),
        buttons: [$t('Cancel'), $t('OK')],
      })
      .then(({ response }) => {
        if (!response) return;
        deleteTrigger(triggerId, scopeId);
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
          sections={sections}
          activeKey={selectedTab}
          onChange={setSelectedTab}
          playAlert={onPlayAlert}
          toggleTrigger={toggleTrigger}
          deleteTrigger={onDelete}
        />
        <ActiveTab />
      </WidgetLayout>
    </div>
  );
}

function AddTriggerTab() {
  const {
    availableGameEvents,
    gameEvents,
    globalEvents,
    games,
    widgetData,
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
      data={widgetData}
      onSubmit={createTrigger}
    />
  );
};

function GameSettingsTab() {
  const { groupOptions, toggleScope, enableAllGroups, disableAllGroups } = useReactiveWidget();

  return (
    <div>
      <ReactiveWidgetGameSettings
        scopes={groupOptions}
        onToggleScope={toggleScope}
        onEnableAll={enableAllGroups}
        onDisableAll={disableAllGroups}
      />
      <hr style={{ margin: '24px 0', opacity: 0.2 }} />
    </div>
  );
};

function ManageTriggersTab() {
  const {
    activeTabContext,
    settings,
    enableAllTriggers,
    disableAllTriggers,
    toggleTrigger,
  } = useReactiveWidget();

  const selectedGame = activeTabContext.gameId || 'global';

  function onToggleGame(triggerId: string, enabled: boolean) {
    toggleTrigger(selectedGame, triggerId, enabled);
  }

  function onEnableAll() {
    enableAllTriggers(selectedGame);
  }

  function onDisableAll() {
    disableAllTriggers(selectedGame);
  }

  const triggers =
    selectedGame === 'global'
      ? settings?.global?.triggers
      : settings?.games?.[selectedGame]?.triggers;

  const options = useMemo(() => {
    return (triggers || [])
      .filter((t) => t.id !== null) 
      .map((t) => ({
        id: t.id as string, 
        name: t.name,
        enabled: t.enabled,
      }));
  }, [triggers]);
  return (
    <ReactiveWidgetGameSettings
      scopes={options}
      onToggleScope={onToggleGame}
      onEnableAll={onEnableAll}
      onDisableAll={onDisableAll}
    />
  );
};

function TriggerDetailsTab() {
  const { activeTabContext, staticConfig, createTriggerBinding } = useReactiveWidget();
  const { gameId: selectedGame, triggerId: selectedTriggerId } = activeTabContext;

  const forceUpdate = useForceUpdate();

  const binding = useMemo(() => {
    if (!selectedGame || !selectedTriggerId || !createTriggerBinding) return null;
    return createTriggerBinding(selectedGame, selectedTriggerId, forceUpdate);
  }, [createTriggerBinding, selectedGame, selectedTriggerId, forceUpdate]);
  const handleUpdate = useCallback(
    (trigger: ReactiveTrigger) => {
      binding?.updateTrigger(trigger);
    },
    [binding],
  );
  const trigger = binding?.trigger;
  if (!trigger) {
    return null;
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

function ResetSettingsButton() {
  const { resetSettings } = useReactiveWidget();

  const handleClick = () => {
    remote.dialog
      .showMessageBox(remote.getCurrentWindow(), {
        title: 'Streamlabs Desktop',
        message: $t('Are you sure you want to reset all settings to default?'),
        buttons: [$t('Cancel'), $t('OK')],
      })
      .then(({ response }) => {
        if (!response) return;
        resetSettings();
      });
  };

  return (
    <Button type="ghost" onClick={handleClick} danger>
      <i className="icon-reset" style={{ marginRight: 8 }} />
      {$t('Reset Settings')}
    </Button>
  );
}