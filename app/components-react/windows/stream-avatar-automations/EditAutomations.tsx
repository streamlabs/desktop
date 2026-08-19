import React, { useEffect, useState } from 'react';
import { Button, Switch, Tooltip, Spin, Popconfirm, Select, Dropdown, Menu, Tag } from 'antd';
import { ModalLayout } from 'components-react/shared/ModalLayout';
import Spinner from 'components-react/shared/Spinner';
import { useVuex } from 'components-react/hooks';
import { useAgentAppInstalled } from 'components-react/hooks/useAgentAppInstalled';
import { Services } from 'components-react/service-provider';
import { $t } from 'services/i18n';
import { Conditions } from 'services/stream-avatar/engine/conditions';
import type { ConditionType } from 'services/stream-avatar/engine/conditions';
import { validateAutomation } from 'services/stream-avatar/engine/validation';
import type { IAutomationIssue } from 'services/stream-avatar/engine/validation';
import type { TAutomationExport } from 'services/stream-avatar/engine/automations';
import { EDismissable } from 'services/dismissables';
import AutomationEditor from './AutomationEditor';
import AutomationsEmptyState from './AutomationsEmptyState';
import AutomationTemplates from './AutomationTemplates';
import { AutomationsAnalytics } from './automations-analytics';
import UltraIcon from 'components-react/shared/UltraIcon';
import { conditionLabel, conditionGame, summarizeActions, GAME_OPTIONS } from './automations-utils';
import {
  checkEnableLimit,
  enabledUsage,
  upgrade,
  ULTRA_PLUS_TIER,
  AUTOMATION_LIMITS,
} from './automations-limits';
import styles from './EditAutomations.m.less';

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
      automations.length === 0,
      // && DismissablesService.views.shouldShow(EDismissable.StreamAvatarAutomationsWelcome),
    );
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
    // Turning one off is always allowed; only turning one on is capped.
    if (!automation.enabled && !checkEnableLimit(1, 'toggle')) return;
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
      <AutomationTemplates variant="welcome" onCancel={dismissWelcome} onSaved={dismissWelcome} />
    );
  }

  if (showPreMade) {
    return (
      <AutomationTemplates
        variant="templatePicker"
        onCancel={() => setShowPreMade(false)}
        onSaved={() => setShowPreMade(false)}
      />
    );
  }

  // Conditions() rebuilds the whole registry, so resolve it once rather than per row.
  const conditions = Conditions();
  const filtered = filterGame
    ? automations.filter(a =>
        a.conditions.some(c => (conditions[c.type as ConditionType]?.group ?? '') === filterGame),
      )
    : automations;

  const usage = enabledUsage();

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
        <div>
          <h1 className={styles.pageTitle}>{$t('Automations')}</h1>
          <p className={styles.pageSubtitle}>
            {$t('Automatically trigger on stream effects in response to gameplay events.')}
          </p>
        </div>
        {loaded && <UsageMeter count={usage.count} max={usage.max} tier={usage.tier} />}
      </div>

      <div className={styles.filterBar}>
        <div className={styles.filterSection}>
          {automations.length > 0 && (
            <>
              <span className={styles.filterLabel}>{$t('Filter by')}</span>
              <Select
                value={filterGame}
                onChange={val => setFilterGame(val)}
                options={[{ label: $t('All game automations'), value: '' }, ...GAME_OPTIONS]}
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
            {filtered.map(automation => (
              <AutomationRow
                key={automation.id}
                automation={automation}
                issues={validateAutomation(automation, {
                  scenes,
                  sources,
                  agentAppReady: isAgentInstalled && isAgentEnabled,
                })}
                simulating={simulatingId === automation.id}
                simulateDisabled={simulatingId !== null}
                onToggle={() => toggleEnabled(automation)}
                onSimulate={() => simulate(automation)}
                onEdit={() => edit(automation)}
                onDelete={() => remove(automation)}
              />
            ))}
          </tbody>
        </table>
      )}
    </ModalLayout>
  );
}

function UsageMeter(p: { count: number; max: number; tier: string }) {
  const pct = p.max > 0 ? Math.min(100, Math.round((p.count / p.max) * 100)) : 0;
  const atCap = p.count >= p.max;
  const atTopTier = p.tier === ULTRA_PLUS_TIER;

  return (
    <div className={styles.usageMeter}>
      <div className={styles.usageRow}>
        <span className={styles.usageText}>
          {$t('%{count}/%{max} automations used', { count: p.count, max: p.max })}
        </span>
        <Tooltip
          title={$t(
            'Free includes %{free} enabled automations, Ultra %{ultra}, and Ultra+ %{ultraPlus}.',
            {
              free: AUTOMATION_LIMITS.free,
              ultra: AUTOMATION_LIMITS.ultra,
              ultraPlus: AUTOMATION_LIMITS[ULTRA_PLUS_TIER],
            },
          )}
        >
          <i className={`icon-information ${styles.usageInfo}`} />
        </Tooltip>
        <div className={styles.usageTrack}>
          <div className={styles.usageFill} style={{ width: `${pct}%` }} />
        </div>
      </div>

      {atCap && !atTopTier && (
        <span className={styles.upgradeLink} onClick={() => upgrade(p.tier, 'header')}>
          <UltraIcon type="badge" />
          <span className={styles.upgradeText}>
            {p.tier === 'ultra'
              ? $t('Upgrade to Ultra+ to unlock more')
              : $t('Upgrade to Ultra to unlock more')}
          </span>
        </span>
      )}
      {atCap && atTopTier && (
        <span className={styles.atCapNote}>{$t('Maximum automations reached')}</span>
      )}
    </div>
  );
}

interface AutomationRowProps {
  automation: TAutomationExport;
  issues: IAutomationIssue[];
  /** This row's own test run is in progress. */
  simulating: boolean;
  /** Some row is testing, so every row's test button is unavailable. */
  simulateDisabled: boolean;
  onToggle: () => void;
  onSimulate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function AutomationRow({
  automation,
  issues,
  simulating,
  simulateDisabled,
  onToggle,
  onSimulate,
  onEdit,
  onDelete,
}: AutomationRowProps) {
  return (
    <tr>
      <td className={styles.descCell}>{automation.description || $t('(no description)')}</td>
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
            <Switch size="small" checked={automation.enabled} onChange={onToggle} />
          </Tooltip>
          <Tooltip title={$t('Test automation')}>
            {simulating ? (
              <Spin size="small" />
            ) : (
              <i
                className={`icon-play-round ${simulateDisabled ? styles.disabledIcon : ''}`}
                onClick={onSimulate}
              />
            )}
          </Tooltip>
          <Tooltip title={$t('Edit')}>
            <i className="icon-edit" onClick={onEdit} />
          </Tooltip>
          <Popconfirm
            title={$t('Delete this automation?')}
            onConfirm={onDelete}
            okText={$t('Delete')}
            cancelText={$t('Cancel')}
          >
            <i className="icon-trash" />
          </Popconfirm>
        </div>
      </td>
    </tr>
  );
}
