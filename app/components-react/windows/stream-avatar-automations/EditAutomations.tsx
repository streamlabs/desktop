import React, { useEffect, useState } from 'react';
import { Button, Switch, Tooltip, Spin, Popconfirm, Select, Dropdown, Menu, Tag } from 'antd';
import { ModalLayout } from 'components-react/shared/ModalLayout';
import { useVuex } from 'components-react/hooks';
import { Services } from 'components-react/service-provider';
import { $t } from 'services/i18n';
import { Conditions, GAME_NAMES } from 'services/stream-avatar/engine/conditions';
import { ActionRegistry } from 'services/stream-avatar/engine/actions';
import { validateAutomation } from 'services/stream-avatar/engine/validation';
import type { TAutomationExport } from 'services/stream-avatar/engine/automations';
import AutomationEditor from './AutomationEditor';
import PreMadeAutomations from './PreMadeAutomations';
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
  const { AutomationsService, AutomationsEngineService, ScenesService, SourcesService } = Services;
  const { automations, loading, scenes, sources } = useVuex(() => ({
    automations: AutomationsService.state.automations,
    loading: AutomationsService.state.loading,
    scenes: ScenesService.views.scenes.map(s => ({ id: s.id, name: s.name })),
    sources: SourcesService.views.sources.map(s => ({ id: s.sourceId, name: s.name })),
  }));

  const [editingAutomation, setEditingAutomation] = useState<TAutomationExport | null>(null);
  const [creating, setCreating] = useState(false);
  const [showPreMade, setShowPreMade] = useState(false);
  const [filterGame, setFilterGame] = useState('');
  const [simulatingId, setSimulatingId] = useState<number | null>(null);

  useEffect(() => {
    AutomationsService.actions.fetchAll();
  }, []);

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

  function closeWindow() {
    WindowsService.actions.closeChildWindow();
  }

  if (creating || editingAutomation) {
    return (
      <AutomationEditor
        initial={editingAutomation ?? undefined}
        onClose={closeEditor}
        onViewTemplates={() => {
          closeEditor();
          setShowPreMade(true);
        }}
      />
    );
  }

  if (showPreMade) {
    return <PreMadeAutomations onClose={() => setShowPreMade(false)} />;
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
        {$t('Add New Automation')}
      </Menu.Item>
      <Menu.Item key="premade" onClick={() => setShowPreMade(true)}>
        {$t('Select from Pre-made')}
      </Menu.Item>
    </Menu>
  );

  const footer = (
    <>
      <Button onClick={closeWindow}>{$t('Cancel')}</Button>
      <Button type="primary" style={{ marginLeft: '8px' }} onClick={closeWindow}>
        {$t('Complete')}
      </Button>
    </>
  );

  return (
    <ModalLayout footer={footer} scrollable>
      <div className={styles.pageHeader}>
        <div className={styles.titleBlock}>
          <h1 className={styles.pageTitle}>
            {$t('Automations')}
            <Tooltip
              title={$t('Automatically trigger stream effects in response to gameplay events')}
            >
              <i className={`fa fa-info-circle ${styles.infoIcon}`} />
            </Tooltip>
          </h1>
          <p className={styles.pageSubtitle}>
            {$t('Automatically trigger on stream effects in response to gameplay events.')}
          </p>
        </div>

        <div className={styles.controls}>
          <span className={styles.filterLabel}>{$t('Filter by')}</span>
          <Select
            value={filterGame}
            onChange={val => setFilterGame(val)}
            options={[{ label: $t('All game automations'), value: '' }, ...GAME_FILTER_OPTIONS]}
            style={{ width: 200 }}
          />
          <Dropdown overlay={addNewMenu} trigger={['click']}>
            <Button type="primary" className={styles.addNewBtn}>
              <i className="icon-add-circle" style={{ marginRight: 6 }} />
              {$t('Add New')}
            </Button>
          </Dropdown>
        </div>
      </div>

      {loading && <div className={styles.message}>{$t('Loading...')}</div>}

      {!loading && automations.length === 0 && (
        <div className={styles.emptyCard}>
          <div className={styles.emptyImage} />
          <h3 className={styles.emptyTitle}>{$t("You don't have Automations set up yet.")}</h3>
          <p className={styles.emptyDesc}>
            {$t(
              'Automatically trigger on stream effects including visual effects, transitions, sounds, agent commentary (and more) in response to gameplay events such as kills, wins, knocks, deaths, and much more. See supported games.',
            )}
          </p>
          <div className={styles.emptyActions}>
            <Button type="primary" onClick={create}>
              {$t('Create Custom')}
            </Button>
            <Button type="primary" onClick={() => setShowPreMade(true)}>
              {$t('Use Pre-made Automations')}
            </Button>
          </div>
        </div>
      )}

      {!loading && automations.length > 0 && filtered.length === 0 && (
        <div className={styles.message}>{$t('No automations match the selected filter.')}</div>
      )}

      {!loading && filtered.length > 0 && (
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
