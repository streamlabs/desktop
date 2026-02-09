import React, { useMemo, useCallback, useEffect, useState } from 'react';
import * as remote from '@electron/remote';
import { WidgetLayout } from './common/WidgetLayout';
import { useGamePulseWidget } from './game-pulse/useGamePulseWidget';
import { GamePulseTabUtils, sanitizeTrigger } from './game-pulse/GamePulse.helpers';
import { TabKind, GamePulseTrigger, ScopeId } from './game-pulse/GamePulse.types';
import { GamePulseMenu } from './game-pulse/GamePulseMenu';
import { GamePulseCreateTriggerForm } from './game-pulse/GamePulseCreateTriggerForm';
import { GamePulseGameSettings } from './game-pulse/GamePulseGameSettings';
import { GamePulseTriggerDetails } from './game-pulse/GamePulseTriggerDetails';
import css from './game-pulse/GamePulse.m.less';
import { useForceUpdate } from 'slap';
import { $t } from 'services/i18n/i18n';
import { Button, Tooltip } from 'antd';

export function GamePulseWidget() {
  const {
    currentTabId,
    setSelectedTab,
    playReactiveAlert,
    sections,
    toggleTrigger,
    deleteTrigger,
    tabKind,
    widgetData,
  } = useGamePulseWidget();
  const { showTutorial } = widgetData;

  const TAB_COMPONENTS: Record<TabKind, React.FC> = {
    [TabKind.AddTrigger]: AddTriggerTab,
    [TabKind.General]: GameSettingsTab,
    [TabKind.GameManage]: ManageTriggersTab,
    [TabKind.TriggerDetail]: TriggerDetailsTab,
  };

  const ActiveTab = TAB_COMPONENTS[tabKind] || GamePulseTabUtils.generateManageGameId(ScopeId.Global);

  const showDisplay = tabKind !== TabKind.General && tabKind !== TabKind.GameManage;

  function onPlayAlert(gameKey: string = ScopeId.Global, trigger: GamePulseTrigger) {
    if (!trigger?.id) return;

    const targetTab = GamePulseTabUtils.generateTriggerId(gameKey, trigger.id);

    if (currentTabId !== targetTab) {
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

  const [tutorialVisible, setTutorialVisible] = useState(false);

  useEffect(() => {
    if (showTutorial) {
      setTutorialVisible(true);
    }
  }, [showTutorial]);

  useEffect(() => {
    if (!currentTabId || currentTabId === TabKind.General) {
      setSelectedTab(GamePulseTabUtils.generateManageGameId(ScopeId.Global));
    }
  }, []);

  return (
    <div className={css.gamePulseWidget}>
      <WidgetLayout
        layout="long-menu"
        showDisplay={showDisplay}
      >
        <Tooltip
          visible={tutorialVisible}
          placement="rightTop"
          trigger={[]}
          align={{ offset: [0, 255] }}
          zIndex={9999}
          title={
            <div>
              <div>
                {$t("Triggers are setup and ready to go! Feel free to uncheck the ones you don't want.")}
              </div>
              <Button
                type="text"
                style={{
                  padding: 0,
                }}
                onClick={() => setTutorialVisible(false)}
              >
                <span style={{ textDecoration: 'underline' }}>
                  {$t('Dismiss')}
                </span>
              </Button>
            </div>
          }
        >
          <div>
            <GamePulseMenu
              sections={sections}
              activeKey={currentTabId}
              onChange={setSelectedTab}
              playAlert={onPlayAlert}
              toggleTrigger={toggleTrigger}
              deleteTrigger={onDelete}
            />
          </div>
        </Tooltip>
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
  } = useGamePulseWidget();

  const gameOptions = [
    { label: 'Global', value: ScopeId.Global },
    ...Object.entries(games).map(([key, value]) => ({ label: value.title, value: key })),
  ];

  return (
    <GamePulseCreateTriggerForm
      trigger={{ game: '', event_type: '', name: '' }}
      availableGameEvents={availableGameEvents}
      gameEvents={gameEvents}
      globalEvents={globalEvents}
      gameOptions={gameOptions}
      data={widgetData}
      onSubmit={createTrigger}
    />
  );
}

function GameSettingsTab() {
  const { groupOptions, toggleScope, enableAllGroups, disableAllGroups } = useGamePulseWidget();

  return (
    <div>
      <GamePulseGameSettings
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
  } = useGamePulseWidget();

  const selectedGame = activeTabContext.gameId || ScopeId.Global;

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
    selectedGame === ScopeId.Global
      ? settings?.global?.triggers
      : settings?.games?.[selectedGame]?.triggers;

  const options = useMemo(() => {
    return (triggers || [])
      .filter(t => t.id !== null)
      .map(t => ({
        id: t.id as string,
        name: t.name,
        enabled: t.enabled,
      }));
  }, [triggers]);
  return (
    <GamePulseGameSettings
      scopes={options}
      onToggleScope={onToggleGame}
      onEnableAll={onEnableAll}
      onDisableAll={onDisableAll}
    />
  );
}

function TriggerDetailsTab() {
  const { activeTabContext, staticConfig, createTriggerBinding } = useGamePulseWidget();
  const { gameId: selectedGame, triggerId: selectedTriggerId } = activeTabContext;

  const forceUpdate = useForceUpdate();

  const binding = useMemo(() => {
    if (!selectedGame || !selectedTriggerId || !createTriggerBinding) return null;
    return createTriggerBinding(selectedGame, selectedTriggerId, forceUpdate);
  }, [createTriggerBinding, selectedGame, selectedTriggerId, forceUpdate]);
  const handleUpdate = useCallback(
    (trigger: GamePulseTrigger) => {
      binding?.updateTrigger(trigger);
    },
    [binding],
  );
  const trigger = binding?.trigger;
  if (!trigger) {
    return null;
  }

  return (
    <GamePulseTriggerDetails
      key={trigger.id}
      trigger={trigger}
      onUpdate={handleUpdate}
      staticConfig={staticConfig}
    />
  );
}
