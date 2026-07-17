import React, { useEffect, useState } from 'react';
import { Button, Switch, Tooltip, Spin, Popconfirm, Select, Dropdown, Menu, Tag } from 'antd';
import { ModalLayout } from 'components-react/shared/ModalLayout';
import Spinner from 'components-react/shared/Spinner';
import { useVuex } from 'components-react/hooks';
import { useAgentAppInstalled } from 'components-react/hooks/useAgentAppInstalled';
import { Services } from 'components-react/service-provider';
import { $t } from 'services/i18n';
import { Conditions, GAME_NAMES } from 'services/stream-avatar/engine/conditions';
import { ActionRegistry } from 'services/stream-avatar/engine/actions';
import { validateAutomation } from 'services/stream-avatar/engine/validation';
import type { TAutomationExport } from 'services/stream-avatar/engine/automations';
import { EDismissable } from 'services/dismissables';
import AutomationEditor from './AutomationEditor';
import AutomationsEmptyState from './AutomationsEmptyState';
import PreMadeAutomations from './PreMadeAutomations';
import { AutomationsAnalytics } from './AutomationsAnalytics';
import styles from './EditAutomations.m.less';

function conditionLabel(condition: { type: string } | null) {
  if (!condition?.type) return $t('(unknown)');
  const def = Conditions[condition.type as keyof typeof Conditions];
  return def ? def.label : condition.type;
}

function conditionGame(condition: { type: string } | null) {
  if (!condition?.type) return '';
  const def = Conditions[condition.type as keyof typeof Conditions];
  if (!def) return '';
  return GAME_NAMES[def.group] ?? def.group;
}

function summarizeActions(actions: TAutomationExport['actions']) {
  return actions
    .filter(a => a?.type)
    .map(a => {
      const def = ActionRegistry[a.type as keyof typeof ActionRegistry];
      return def ? def.label : a.type;
    })
    .join(', ');
}

const GAME_FILTER_OPTIONS = Object.entries(GAME_NAMES)
  .map(([id, name]) => ({ label: name, value: id }))
  .sort((a, b) => a.label.localeCompare(b.label));

export default function EditAutomations() {
  const {
    AutomationsService,
    AutomationsEngineService,
    ScenesService,
    SourcesService,
    DismissablesService,
  } = Services;
  const { automations, loaded, error, scenes, sources } = useVuex(() => ({
    automations: AutomationsService.state.automations,
    loaded: AutomationsService.state.loaded,
    error: AutomationsService.state.error,
    scenes: ScenesService.views.scenes.map(s => ({ id: s.id, name: s.name })),
    sources: SourcesService.views.sources.map(s => ({ id: s.sourceId, name: s.name })),
  }));
  const { isInstalled: isAgentInstalled, isEnabled: isAgentEnabled } = useAgentAppInstalled();

  const [editingAutomation, setEditingAutomation] = useState<TAutomationExport | null>(null);
  const [creating, setCreating] = useState(false);
  const [showPreMade, setShowPreMade] = useState(false);
  const [filterGame, setFilterGame] = useState('');
  const [simulatingId, setSimulatingId] = useState<number | null>(null);
  const [showWelcome, setShowWelcome] = useState<boolean | null>(null);

  useEffect(() => {
    AutomationsAnalytics.pageView();
    AutomationsService.actions.fetchAll();
  }, []);

  // the welcome screen for returning users before fetchAll() resolves.
  useEffect(() => {
    if (showWelcome !== null || !loaded) return;
    setShowWelcome(
      automations.length === 0 &&
        DismissablesService.views.shouldShow(EDismissable.StreamAvatarAutomationsWelcome),
    );

    // Uncomment when going to prod
    // setShowWelcome(
    //   automations.length === 0 &&
    //     DismissablesService.views.shouldShow(EDismissable.StreamAvatarAutomationsWelcome),
    // );
  }, [loaded, automations.length, showWelcome]);

  function dismissWelcome() {
    DismissablesService.actions.dismiss(EDismissable.StreamAvatarAutomationsWelcome);
    setShowWelcome(false);
  }

  function retryNow() {
    AutomationsService.actions.fetchAll();
  }

  const { WindowsService } = Services;
  const { editAutomationId, createNew } = useVuex(() => ({
    editAutomationId: WindowsService.state.child.queryParams?.editAutomationId as
      | number
      | undefined,
    createNew: !!WindowsService.state.child.queryParams?.createNew,
  }));

  const launchedFromElement = !!editAutomationId || createNew;

  useEffect(() => {
    if (!createNew) return;
    setCreating(true);
    setEditingAutomation(null);
  }, [createNew]);

  useEffect(() => {
    if (!editAutomationId || automations.length === 0) return;
    const target = automations.find(a => a.id === editAutomationId);
    if (target) setEditingAutomation(target);
  }, [editAutomationId, automations]);

  async function simulate(automation: TAutomationExport) {
    if (!automation.id || simulatingId !== null) return;
    setSimulatingId(automation.id);
    try {
      await AutomationsEngineService.actions.return.simulateAutomation(automation.id);
    } finally {
      setSimulatingId(null);
    }
  }

  function toggleEnabled(automation: TAutomationExport) {
    if (!automation.id) return;
    AutomationsService.actions.update(automation.id, {
      ...automation,
      enabled: !automation.enabled,
    });
  }

  function remove(automation: TAutomationExport) {
    if (!automation.id) return;
    AutomationsService.actions.remove(automation.id);
  }

  function edit(automation: TAutomationExport) {
    setEditingAutomation(automation);
    setCreating(false);
    setShowPreMade(false);
  }

  function create() {
    setEditingAutomation(null);
    setCreating(true);
    setShowPreMade(false);
  }

  function closeEditor() {
    if (launchedFromElement) {
      WindowsService.actions.closeChildWindow();
    } else {
      setEditingAutomation(null);
      setCreating(false);
      setShowPreMade(false);
    }
  }

  if (creating || editingAutomation) {
    return <AutomationEditor initial={editingAutomation ?? undefined} onClose={closeEditor} />;
  }

  if (showWelcome) {
    return (
      <PreMadeAutomations variant="welcome" onCancel={dismissWelcome} onSaved={dismissWelcome} />
    );
  }

  if (showPreMade) {
    return (
      <PreMadeAutomations
        variant="templatePicker"
        onCancel={() => setShowPreMade(false)}
        onSaved={() => setShowPreMade(false)}
      />
    );
  }

  const filtered = filterGame
    ? automations.filter(a =>
        a.conditions.some(
          c => (Conditions[c.type as keyof typeof Conditions]?.group ?? '') === filterGame,
        ),
      )
    : automations;

  const addNewMenu = (
    <Menu>
      <Menu.Item key="new" onClick={create}>
        {$t('Create Custom')}
      </Menu.Item>
      <Menu.Item key="premade" onClick={() => setShowPreMade(true)}>
        {$t('Use Template')}
      </Menu.Item>
    </Menu>
  );

  return (
    <ModalLayout hideFooter scrollable>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{$t('Automations')}</h1>
        <p className={styles.pageSubtitle}>
          {$t('Automatically trigger on stream effects in response to gameplay events.')}
        </p>
      </div>

      <div className={styles.filterBar}>
        <div className={styles.filterSection}>
          {automations.length > 0 && (
            <>
              <span className={styles.filterLabel}>{$t('Filter by')}</span>
              <Select
                value={filterGame}
                onChange={val => setFilterGame(val)}
                options={[{ label: $t('All game automations'), value: '' }, ...GAME_FILTER_OPTIONS]}
                style={{ width: 200 }}
              />
            </>
          )}
        </div>
        <Dropdown overlay={addNewMenu} trigger={['click']}>
          <Button type="primary" className={styles.addNewBtn}>
            <i className="icon-add-circle" style={{ marginRight: 6 }} />
            {$t('Add Automation')}
          </Button>
        </Dropdown>
      </div>

      {!loaded && !error && <Spinner visible relative />}

      {error && (
        <div className={styles.message}>
          {$t('Unable to reach the automations server. Retrying…')}
          <Button type="link" onClick={retryNow} style={{ marginLeft: 8 }}>
            {$t('Retry Now')}
          </Button>
        </div>
      )}

      {loaded && automations.length === 0 && <AutomationsEmptyState />}

      {loaded && automations.length > 0 && filtered.length === 0 && (
        <div className={styles.message}>{$t('No automations match the selected filter.')}</div>
      )}

      {loaded && filtered.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{$t('DESCRIPTION')}</th>
              <th>{$t('TRIGGER')}</th>
              <th>{$t('REACTION')}</th>
              <th>{$t('GAME')}</th>
              <th className={styles.actionsCol} />
            </tr>
          </thead>
          <tbody>
            {filtered.map(automation => {
              const issues = validateAutomation(automation, {
                scenes,
                sources,
                agentAppReady: isAgentInstalled && isAgentEnabled,
              });
              return (
                <tr key={automation.id}>
                  <td className={styles.descCell}>
                    {automation.description || $t('(no description)')}
                  </td>
                  <td>{automation.conditions.map(c => conditionLabel(c)).join(', ')}</td>
                  <td className={styles.mutedCell}>{summarizeActions(automation.actions)}</td>
                  <td>
                    {automation.conditions.map((c, i) => {
                      const game = conditionGame(c);
                      return game ? (
                        <Tag key={i} className={styles.badge}>
                          {game}
                        </Tag>
                      ) : null;
                    })}
                  </td>
                  <td>
                    <div className={styles.rowActions}>
                      {issues.length > 0 && (
                        <Tooltip
                          title={
                            <div>
                              {issues.map((issue, i) => (
                                <div key={i}>{issue.message}</div>
                              ))}
                            </div>
                          }
                        >
                          <i className={`icon-error ${styles.errorIcon}`} />
                        </Tooltip>
                      )}
                      <Tooltip title={automation.enabled ? $t('Enabled') : $t('Disabled')}>
                        <Switch
                          size="small"
                          checked={automation.enabled}
                          onChange={() => toggleEnabled(automation)}
                        />
                      </Tooltip>
                      <Tooltip title={$t('Test automation')}>
                        {simulatingId === automation.id ? (
                          <Spin size="small" />
                        ) : (
                          <i
                            className={`icon-play-round ${
                              simulatingId !== null ? styles.disabledIcon : ''
                            }`}
                            onClick={() => simulate(automation)}
                          />
                        )}
                      </Tooltip>
                      <Tooltip title={$t('Edit')}>
                        <i className="icon-edit" onClick={() => edit(automation)} />
                      </Tooltip>
                      <Popconfirm
                        title={$t('Delete this automation?')}
                        onConfirm={() => remove(automation)}
                        okText={$t('Delete')}
                        cancelText={$t('Cancel')}
                      >
                        <i className="icon-trash" />
                      </Popconfirm>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </ModalLayout>
  );
}
