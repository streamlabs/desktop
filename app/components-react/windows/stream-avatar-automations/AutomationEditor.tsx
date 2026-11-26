import React, { CSSProperties, useState } from 'react';
import { Button, Select, Tooltip } from 'antd';
import { ReactSortable } from 'react-sortablejs';
import uuid from 'uuid/v4';
import { ModalLayout } from 'components-react/shared/ModalLayout';
import { useVuex } from 'components-react/hooks';
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

const errorTextStyle: CSSProperties = {
  margin: '4px 0 0',
  color: 'var(--red)',
  fontSize: '12px',
};

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
  const { AutomationsService, ScenesService, SourcesService } = Services;
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
  const streamEventsOnly =
    conditions.length > 0 && conditions.every(c => isStreamEventKey(c.type));
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

  const sectionLabelStyle: CSSProperties = {
    display: 'block',
    marginBottom: 8,
    fontWeight: 700,
    fontSize: 15,
    color: 'var(--title)',
  };

  const sectionSubtitleStyle: CSSProperties = {
    margin: 0,
    fontSize: 12,
    color: 'var(--paragraph)',
  };

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
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
        }}
      >
        <h2 style={{ margin: 0, color: 'var(--title)', fontWeight: 700 }}>
          {initial ? $t('Edit Automation') : $t('Add New Automation')}
        </h2>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {/* Description */}
        <div style={{ marginBottom: 24 }}>
          <label
            style={{
              display: 'block',
              marginBottom: 8,
              fontSize: 15,
              color: 'var(--title)',
              fontWeight: 700,
            }}
          >
            {$t('Description')}
          </label>
          <TextInput
            nowrap
            value={description}
            onChange={val => setDescription(val)}
            placeholder={$t('e.g. Victory Royale reaction')}
          />
          {descriptionError && <p style={errorTextStyle}>{descriptionError}</p>}
        </div>

        {/* Scene */}
        <div style={{ marginBottom: 24 }}>
          <label style={sectionLabelStyle}>{$t('Limit to Scene')}</label>
          <p style={{ ...sectionSubtitleStyle, marginBottom: 16 }}>
            {$t('Only trigger while this scene is active.')}
          </p>
          <Select
            // Option values are scene IDs so a scene named like the sentinel can't collide with it
            value={scenes.find(s => s.name === selectedScene)?.id ?? selectedScene ?? ANY_SCENE}
            onChange={val => setSelectedScene(scenes.find(s => s.id === val)?.name)}
            options={[
              { value: ANY_SCENE, label: $t('Any Scene') },
              ...scenes.map(s => ({ value: s.id, label: s.name })),
            ]}
            style={{ width: '50%' }}
          />
          {sceneError && <p style={errorTextStyle}>{sceneError}</p>}
        </div>

        {/* Triggers */}
        <div style={{ marginBottom: 24 }}>
          <label style={sectionLabelStyle}>{$t('Add Trigger(s)')}</label>
          <p style={{ ...sectionSubtitleStyle, marginBottom: 16 }}>
            {$t('Add up to 5 triggers. Any of them activates this automation.')}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {triggers.map((row, i) => (
              <TriggerEditor
                key={row.id}
                index={i}
                trigger={row}
                valueError={valueMissing[i] ? valueError : undefined}
                canRemove={triggers.length > 1}
                onChange={handleTriggerChange}
                onRemove={handleTriggerRemove}
              />
            ))}
          </div>
          {conditionError && <p style={errorTextStyle}>{conditionError}</p>}
          <Tooltip title={atMaxTriggers ? $t('You can add up to 5 triggers.') : undefined}>
            <Button
              block
              onClick={handleAddTrigger}
              disabled={atMaxTriggers}
              style={{ marginTop: 16, fontWeight: 700 }}
            >
              <i className="icon-add-circle" style={{ marginRight: 6 }} />
              {$t('Add Trigger')}
            </Button>
          </Tooltip>
        </div>

        {/* Reactions */}
        <div>
          <label style={sectionLabelStyle}>{$t('Add Reaction(s)')}</label>
          <p style={{ ...sectionSubtitleStyle, marginBottom: 16 }}>
            {$t('Add action(s) to perform after the trigger')}
          </p>
          <ReactSortable<ActionRow>
            list={rows}
            setList={setRows}
            handle=".sa-action-drag-handle"
            animation={200}
            tag="div"
            style={{ display: 'flex', flexDirection: 'column' }}
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
          {actionsError && <p style={errorTextStyle}>{actionsError}</p>}
          <Button block onClick={handleAddAction} style={{ marginTop: 16, fontWeight: 700 }}>
            <i className="icon-add-circle" style={{ marginRight: 6 }} />
            {$t('Add Reaction')}
          </Button>
        </div>

        {error && <p style={{ color: 'var(--red)', margin: 0 }}>{error}</p>}
      </div>
    </ModalLayout>
  );
}
