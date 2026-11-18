import React, { useState } from 'react';
import { Button, Select, Tooltip } from 'antd';
import { ReactSortable } from 'react-sortablejs';
import cx from 'classnames';
import uuid from 'uuid/v4';
import { ModalLayout } from 'components-react/shared/ModalLayout';
import { useIsMounted, useVuex } from 'components-react/hooks';
import { useAgentAppInstalled } from 'components-react/hooks/useAgentAppInstalled';
import { Services } from 'components-react/service-provider';
import { $t } from 'services/i18n';
import { withActionDefaults } from 'services/stream-avatar/engine/actions';
import { validateAutomation } from 'services/stream-avatar/engine/validation';
import { isStreamEventKey } from 'services/stream-avatar/engine/conditions';
import type { TAutomationExport } from 'services/stream-avatar/engine/automations';
import { AutomationsAnalytics } from './automations-analytics';
import type { ActionType, ExportedAction } from 'services/stream-avatar/engine/actions';
import { TextInput } from 'components-react/shared/inputs';
import ActionEditor from './ActionEditor';
import TriggerEditor, { isTriggerValueMissing } from './TriggerEditor';
import type { TriggerValue } from './TriggerEditor';
import { checkEnableLimit } from './automations-limits';
import styles from './AutomationEditor.m.less';

const ANY_SCENE = '__any_scene__';

interface ActionRow {
  id: string;
  action: ExportedAction;
}

function makeRow(action: ExportedAction): ActionRow {
  return { id: uuid(), action: withActionDefaults(action) };
}

const MAX_TRIGGERS = 5;

interface TriggerRow extends TriggerValue {
  id: string;
}

function makeTriggerRow(condition?: TAutomationExport['conditions'][number]): TriggerRow {
  const type = (condition?.type ?? '') as TriggerRow['type'];
  return {
    id: uuid(),
    source: type.split('.')[0],
    type,
    props: (condition?.props as Record<string, unknown>) ?? {},
  };
}

interface Props {
  initial?: TAutomationExport;
  onClose: () => void;
}

export default function AutomationEditor({ initial, onClose }: Props) {
  const { AutomationsService, AutomationsEngineService, ScenesService, SourcesService } = Services;
  const {
    isInstalled: isAgentInstalled,
    isEnabled: isAgentEnabled,
    installAgent,
    enableAgent,
  } = useAgentAppInstalled();

  const { scenes, sources } = useVuex(() => ({
    scenes: ScenesService.views.scenes.map(s => ({ id: s.id, name: s.name })),
    sources: SourcesService.views.sources
      .filter(s => s.video)
      .map(s => ({ id: s.sourceId, name: s.name })),
  }));

  const [description, setDescription] = useState(initial?.description ?? '');
  const [triggers, setTriggers] = useState<TriggerRow[]>(() =>
    initial?.conditions?.length ? initial.conditions.map(makeTriggerRow) : [makeTriggerRow()],
  );
  const [selectedScene, setSelectedScene] = useState<string | undefined>(initial?.scenes?.[0]);
  const [rows, setRows] = useState<ActionRow[]>(
    () =>
      (initial?.actions as ExportedAction[])?.filter(a => a?.type).map(makeRow) ?? [
        { id: uuid(), action: { type: '' as ActionType } },
      ],
  );
  const actions = rows.filter(r => r.action.type).map(r => r.action);
  // New automations start enabled unless that would exceed the tier cap, in which case
  // checkEnableLimit() has already shown the upgrade modal and we save it disabled.
  const enabled = initial?.enabled ?? undefined;
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [attempted, setAttempted] = useState(!!initial);

  // Rows without a condition type are blank placeholders and aren't saved.
  const conditions: TAutomationExport['conditions'] = triggers.flatMap(t =>
    t.type
      ? [{ type: t.type, props: (Object.keys(t.props).length > 0 ? t.props : undefined) as any }]
      : [],
  );

  const draft: TAutomationExport = {
    description,
    conditions,
    scenes: selectedScene ? [selectedScene] : undefined,
    actions,
    enabled: enabled ?? true,
  };
  const issues = validateAutomation(draft, {
    scenes,
    sources,
    agentAppReady: isAgentInstalled && isAgentEnabled,
  });
  // Alert conditions like "amount is at least" need a number/tier to compare against.
  const valueMissing = triggers.map(isTriggerValueMissing);
  // Stream events are pulses with no "unmet" pass, so the "if condition is false" option can't fire.
  const streamEventsOnly = conditions.length > 0 && conditions.every(c => isStreamEventKey(c.type));
  if (valueMissing.some(Boolean)) {
    issues.push({
      scope: 'conditions',
      field: 'value',
      message: $t('Enter a value for this condition'),
    });
  }

  const descriptionError = attempted
    ? issues.find(i => i.scope === 'description')?.message
    : undefined;
  const conditionError = attempted
    ? issues.find(i => i.scope === 'conditions' && i.field !== 'scene' && i.field !== 'value')
        ?.message
    : undefined;
  const valueError = attempted
    ? issues.find(i => i.scope === 'conditions' && i.field === 'value')?.message
    : undefined;
  const sceneError = attempted
    ? issues.find(i => i.scope === 'conditions' && i.field === 'scene')?.message
    : undefined;
  const actionsError = attempted
    ? issues.find(i => i.scope === 'action' && i.actionIndex === undefined)?.message
    : undefined;
  const actionErrors: Record<number, Record<string, string>> = {};
  issues.forEach(i => {
    if (i.scope === 'action' && i.actionIndex !== undefined && i.field) {
      actionErrors[i.actionIndex] = actionErrors[i.actionIndex] ?? {};
      actionErrors[i.actionIndex][i.field] = i.message;
    }
  });

  const atMaxTriggers = triggers.length >= MAX_TRIGGERS;

  // A test run ends after the 5s "unmet" pass, by which time the editor may have been closed.
  const isMounted = useIsMounted();
  // The name doesn't affect a test run, and its error stays hidden until Save is clicked.
  const canTest = !saving && !testing && !issues.some(i => i.scope !== 'description');

  function handleTriggerChange(index: number, trigger: TriggerValue) {
    setTriggers(prev => prev.map((r, i) => (i === index ? { ...r, ...trigger } : r)));
  }

  function handleTriggerRemove(index: number) {
    setTriggers(prev => prev.filter((_, i) => i !== index));
  }

  function handleAddTrigger() {
    setTriggers(prev => (prev.length >= MAX_TRIGGERS ? prev : [...prev, makeTriggerRow()]));
  }

  function handleActionChange(index: number, action: ExportedAction) {
    setRows(prev => prev.map((r, i) => (i === index ? { ...r, action } : r)));
  }

  function handleActionRemove(index: number) {
    setRows(prev => prev.filter((_, i) => i !== index));
  }

  function handleAddAction() {
    setRows(prev => [...prev, { id: uuid(), action: { type: '' as ActionType } }]);
  }

  async function handleSave() {
    setAttempted(true);
    if (issues.length > 0) {
      setError($t('Please fix the highlighted fields before saving.'));
      return;
    }

    setError('');
    setSaving(true);
    try {
      const payload: Omit<TAutomationExport, 'id'> = {
        description: description.trim(),
        conditions,
        scenes: selectedScene ? [selectedScene] : undefined,
        actions,
        enabled: enabled ?? checkEnableLimit(1, 'editor'),
      };

      const game = payload.conditions[0]?.type.split('.')[0] ?? 'unknown';
      const trigger = payload.conditions[0]?.type ?? 'unknown';
      const actionTypes = payload.actions.map((a: { type: string }) => a.type);

      if (initial?.id) {
        await AutomationsService.actions.update(initial.id, payload);
        AutomationsAnalytics.automationUpdated(game, trigger, actionTypes);
      } else {
        await AutomationsService.actions.create(payload);
        AutomationsAnalytics.automationCreated(game, trigger, actionTypes);
      }
      onClose();
    } catch (e: unknown) {
      setError((e as any)?.message ?? $t('Failed to save automation.'));
    } finally {
      setSaving(false);
    }
  }

  /** Runs the unsaved draft once, as the list's play button does for a saved automation. */
  async function handleTest() {
    if (testing) return;
    setTesting(true);
    try {
      await AutomationsEngineService.actions.return.simulateDraft(draft);
    } catch (e: unknown) {
      console.warn('[AutomationEditor] Test run failed', e);
    } finally {
      if (isMounted.current) setTesting(false);
    }
  }

  let saveLabel = initial ? $t('Save Automation') : $t('Create Automation');
  if (saving) saveLabel = $t('Saving...');

  const footer = (
    <>
      <Button onClick={onClose} disabled={saving} style={{ fontWeight: 500 }}>
        {$t('Cancel')}
      </Button>
      <Button
        type="primary"
        style={{ marginLeft: '8px', fontWeight: 600 }}
        onClick={handleSave}
        disabled={saving}
      >
        {saveLabel}
      </Button>
    </>
  );

  return (
    <ModalLayout scrollable footer={footer}>
      <div className={styles.form}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>
            {initial ? $t('Edit Automation') : $t('Add New Automation')}
          </h2>
          <Button className={styles.testButton} onClick={handleTest} disabled={!canTest}>
            <i className="fas fa-wrench" />
            {$t('Test Automation')}
          </Button>
        </div>

        {/* Name */}
        <div className={styles.field}>
          <label className={styles.sectionTitle}>{$t('Name')}</label>
          <div>
            <TextInput
              nowrap
              value={description}
              onChange={val => setDescription(val)}
              placeholder={$t('e.g. Victory Royale reaction')}
            />
            {descriptionError && <p className={styles.errorText}>{descriptionError}</p>}
          </div>
        </div>

        {/* Scene */}
        <div className={styles.sceneSection}>
          <div className={styles.sectionHeading}>
            <label className={styles.sectionTitle}>{$t('Limit to Scene')}</label>
            <p className={styles.sectionSubtitle}>
              {$t('Only trigger while this scene is active.')}
            </p>
          </div>
          <div>
            <Select
              // Option values are scene IDs so a scene named like the sentinel can't collide with it
              value={scenes.find(s => s.name === selectedScene)?.id ?? selectedScene ?? ANY_SCENE}
              onChange={val => setSelectedScene(scenes.find(s => s.id === val)?.name)}
              options={[
                { value: ANY_SCENE, label: $t('Any Scene') },
                ...scenes.map(s => ({ value: s.id, label: s.name })),
              ]}
              className={styles.sceneSelect}
            />
            {sceneError && <p className={styles.errorText}>{sceneError}</p>}
          </div>
        </div>

        <div className={styles.sectionGroup}>
          {/* Triggers */}
          <div>
            <div className={cx(styles.sectionHeading, styles.triggerHeading)}>
              <label className={styles.sectionTitle}>{$t('When Any of these Occur')}</label>
              <p className={styles.sectionSubtitle}>
                {$t('What starts this automation. (Triggers)')}
              </p>
            </div>
            <div className={styles.triggerList}>
              {triggers.map((row, i) => (
                <TriggerEditor
                  key={row.id}
                  index={i}
                  trigger={row}
                  valueError={valueMissing[i] ? valueError : undefined}
                  canRemove={i > 0}
                  onChange={handleTriggerChange}
                  onRemove={handleTriggerRemove}
                />
              ))}
            </div>
            {conditionError && <p className={styles.listError}>{conditionError}</p>}
            <Tooltip title={atMaxTriggers ? $t('You can add up to 5 triggers.') : undefined}>
              <Button
                block
                className={styles.addButton}
                onClick={handleAddTrigger}
                disabled={atMaxTriggers}
              >
                <i className="icon-add-circle" />
                {$t('Add Trigger (%{left}/%{max} left)', {
                  left: MAX_TRIGGERS - triggers.length,
                  max: MAX_TRIGGERS,
                })}
              </Button>
            </Tooltip>
          </div>

          {/* Reactions */}
          <div>
            <div className={styles.sectionHeading}>
              <label className={styles.sectionTitle}>{$t('Then do this (these)')}</label>
              <p className={styles.sectionSubtitle}>
                {$t('Add action(s) to perform after the trigger')}
              </p>
            </div>
            <ReactSortable<ActionRow>
              list={rows}
              setList={setRows}
              handle=".sa-action-drag-handle"
              animation={200}
              tag="div"
              className={styles.reactionList}
            >
              {rows.map((row, i) => (
                <div key={row.id}>
                  <ActionEditor
                    action={row.action}
                    index={i}
                    scenes={scenes}
                    sources={sources}
                    errors={actionErrors[i]}
                    isAgentInstalled={isAgentInstalled}
                    isAgentEnabled={isAgentEnabled}
                    streamEventsOnly={streamEventsOnly}
                    onInstallAgent={installAgent}
                    onEnableAgent={enableAgent}
                    onChange={handleActionChange}
                    onRemove={handleActionRemove}
                  />
                </div>
              ))}
            </ReactSortable>
            {actionsError && <p className={styles.listError}>{actionsError}</p>}
            <Button block className={styles.addButton} onClick={handleAddAction}>
              <i className="icon-add-circle" />
              {$t('Add Reaction')}
            </Button>
          </div>
        </div>

        {error && <p className={styles.formError}>{error}</p>}
      </div>
    </ModalLayout>
  );
}
