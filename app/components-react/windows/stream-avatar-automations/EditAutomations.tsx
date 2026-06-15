import React, { useEffect, useState } from 'react';
import { Switch, Tooltip, Empty, Spin, Popconfirm } from 'antd';
import { ModalLayout } from 'components-react/shared/ModalLayout';
import { useVuex } from 'components-react/hooks';
import { Services } from 'components-react/service-provider';
import { $t } from 'services/i18n';
import { Conditions, GAME_NAMES } from 'services/stream-avatar/engine/conditions';
import { ActionRegistry } from 'services/stream-avatar/engine/actions';
import { validateAutomation } from 'services/stream-avatar/engine/validation';
import type { TAutomationExport } from 'services/stream-avatar/engine/automations';
import AutomationEditor from './AutomationEditor';
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

export default function EditAutomations() {
  const { AutomationsService, AutomationsEngineService, ScenesService, SourcesService } = Services;
  const { automations, loading, scenes, sources } = useVuex(() => ({
    automations: AutomationsService.state.automations,
    loading: AutomationsService.state.loading,
    scenes: ScenesService.views.scenes.map(s => ({ id: s.id, name: s.name })),
    sources: SourcesService.views.sources.map(s => ({ id: s.sourceId, name: s.name })),
  }));

  const [editingAutomation, setEditingAutomation] = useState<TAutomationExport | null>(null);
  const [creating, setCreating] = useState(false);
  const [simulatingId, setSimulatingId] = useState<number | null>(null);

  useEffect(() => {
    AutomationsService.actions.fetchAll();
  }, []);

  // Read queryParams reactively so changes re-trigger when window is reused.
  const { WindowsService } = Services;
  const { editAutomationId, createNew } = useVuex(() => ({
    editAutomationId: WindowsService.state.child.queryParams?.editAutomationId as
      | number
      | undefined,
    createNew: !!WindowsService.state.child.queryParams?.createNew,
  }));

  // True when launched from the AutomationsElement — close the window on done instead of returning to list.
  const launchedFromElement = !!editAutomationId || createNew;

  // Jump straight into create flow when launched with createNew param.
  useEffect(() => {
    if (!createNew) return;
    setCreating(true);
    setEditingAutomation(null);
  }, [createNew]);

  // Jump straight into the editor for a specific automation when launched with editAutomationId.
  useEffect(() => {
    if (!editAutomationId || automations.length === 0) return;
    const target = automations.find(a => a.id === editAutomationId);
    if (target) setEditingAutomation(target);
  }, [editAutomationId, automations]);

  async function simulate(automation: TAutomationExport) {
    if (!automation.id || simulatingId !== null) return;
    setSimulatingId(automation.id);
    try {
      // `.return` so the promise resolves only after the worker finishes the
      // simulation (including its revert delay), keeping the spinner accurate.
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
  }

  function create() {
    setEditingAutomation(null);
    setCreating(true);
  }

  function closeEditor() {
    if (launchedFromElement) {
      WindowsService.actions.closeChildWindow();
    } else {
      setEditingAutomation(null);
      setCreating(false);
    }
  }

  if (creating || editingAutomation) {
    return <AutomationEditor initial={editingAutomation ?? undefined} onClose={closeEditor} />;
  }

  return (
    <ModalLayout scrollable onOk={create} okText={$t('New Automation')}>
      {loading && <div className={styles.message}>{$t('Loading...')}</div>}

      {!loading && automations.length === 0 && (
        <Empty className={styles.empty} description={$t("You don't have any automations yet.")} />
      )}

      {!loading && automations.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{$t('Description')}</th>
              <th>{$t('When')}</th>
              <th>{$t('Do')}</th>
              <th>{$t('Game')}</th>
              <th className={styles.actionsCol} />
            </tr>
          </thead>
          <tbody>
            {automations.map(automation => {
              const issues = validateAutomation(automation, { scenes, sources });
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
                        <span key={i} className={styles.badge}>
                          {game}
                        </span>
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
                        <Tooltip title={$t('Delete')}>
                          <i className="icon-trash" />
                        </Tooltip>
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
