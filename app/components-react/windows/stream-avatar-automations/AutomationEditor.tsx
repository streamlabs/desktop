import React, { CSSProperties, useEffect, useState } from 'react';
import { Button, Select, Slider } from 'antd';
import { Properties } from 'services/stream-avatar/engine/properties';
import { ReactSortable } from 'react-sortablejs';
import uuid from 'uuid/v4';
import { ModalLayout } from 'components-react/shared/ModalLayout';
import { useVuex } from 'components-react/hooks';
import { useAgentAppInstalled } from 'components-react/hooks/useAgentAppInstalled';
import { Services } from 'components-react/service-provider';
import { $t } from 'services/i18n';
import { Conditions, ConditionType } from 'services/stream-avatar/engine/conditions';
import { withActionDefaults } from 'services/stream-avatar/engine/actions';
import { validateAutomation } from 'services/stream-avatar/engine/validation';
import type { TAutomationExport } from 'services/stream-avatar/engine/automations';
import { AutomationsAnalytics } from './automations-analytics';
import type { ActionType, ExportedAction } from 'services/stream-avatar/engine/actions';
import { TextInput } from 'components-react/shared/inputs';
import ActionEditor from './ActionEditor';
import { GAME_OPTIONS } from './automations-utils';

const errorTextStyle: CSSProperties = {
  margin: '4px 0 0',
  color: 'var(--red)',
  fontSize: '12px',
};

interface ActionRow {
  id: string;
  action: ExportedAction;
}

function makeRow(action: ExportedAction): ActionRow {
  return { id: uuid(), action: withActionDefaults(action) };
}

function getConditionOptions(gameId: string) {
  return Object.entries(Conditions)
    .filter(([, def]) => def.group === gameId && !def.disabled)
    .map(([key, def]) => ({ label: def.label, value: key as ConditionType }))
    .sort((a, b) => a.label.localeCompare(b.label));
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
  const [selectedGame, setSelectedGame] = useState(() => {
    if (initial?.conditions?.[0]) {
      return (initial.conditions[0].type as string).split('.')[0];
    }
    return '';
  });
  const [conditionType, setConditionType] = useState<ConditionType | ''>(() => {
    return (initial?.conditions?.[0]?.type as ConditionType) ?? '';
  });
  const [conditionProps, setConditionProps] = useState<Record<string, unknown>>(() => {
    return (initial?.conditions?.[0]?.props as Record<string, unknown>) ?? {};
  });
  const [rows, setRows] = useState<ActionRow[]>(
    () =>
      (initial?.actions as ExportedAction[])?.filter(a => a?.type).map(makeRow) ?? [
        { id: uuid(), action: { type: '' as ActionType } },
      ],
  );
  const actions = rows.filter(r => r.action.type).map(r => r.action);
  const enabled = initial?.enabled ?? true;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [attempted, setAttempted] = useState(!!initial);

  const conditionOptions = getConditionOptions(selectedGame);

  const conditionPropsForSave = Object.keys(conditionProps).length > 0 ? conditionProps : undefined;

  const draft: TAutomationExport = {
    description,
    conditions: conditionType ? [{ type: conditionType, props: conditionPropsForSave as any }] : [],
    actions,
    enabled,
  };
  const issues = validateAutomation(draft, {
    scenes,
    sources,
    agentAppReady: isAgentInstalled && isAgentEnabled,
  });

  const descriptionError = attempted
    ? issues.find(i => i.scope === 'description')?.message
    : undefined;
  const conditionError = attempted
    ? issues.find(i => i.scope === 'conditions')?.message
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

  function applyConditionType(type: ConditionType | '') {
    setConditionType(type);
    const def = type ? Conditions[type] : undefined;
    const defaults: Record<string, unknown> = {};
    if (def?.properties) {
      for (const [key, prop] of Object.entries(def.properties)) {
        if ('default' in prop.config) defaults[key] = prop.config.default;
      }
    }
    setConditionProps(defaults);
  }

  useEffect(() => {
    const current = conditionOptions.find(o => o.value === conditionType);
    if (!current) applyConditionType('');
  }, [selectedGame]);

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
        conditions: conditionType
          ? [{ type: conditionType, props: conditionPropsForSave as any }]
          : [],
        actions,
        enabled,
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

        {/* Trigger */}
        <div style={{ marginBottom: 24 }}>
          <label style={sectionLabelStyle}>{$t('Add Trigger')}</label>
          <p style={{ ...sectionSubtitleStyle, marginBottom: 16 }}>
            {$t('Set the condition that activates this automation')}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <Select
              value={selectedGame || undefined}
              onChange={val => setSelectedGame(val)}
              placeholder={$t('Select a Game')}
              options={GAME_OPTIONS}
            />
            <Select
              value={conditionType || undefined}
              onChange={val => applyConditionType(val as ConditionType)}
              placeholder={$t('Select a Condition')}
              options={conditionOptions}
            />
          </div>
          {conditionError && <p style={errorTextStyle}>{conditionError}</p>}

          {conditionType &&
            (() => {
              const def = Conditions[conditionType as ConditionType];
              if (!def?.properties) return null;
              return Object.entries(def.properties).map(([key, prop]) => {
                if (prop instanceof Properties.SliderRange) {
                  const { min, max, step, label } = prop.config;
                  const value = (conditionProps[key] as [number, number]) ?? prop.config.default;
                  return (
                    <div key={key} style={{ marginTop: 12 }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginBottom: 4,
                          fontSize: 12,
                        }}
                      >
                        <span style={{ color: 'var(--title)', fontWeight: 600 }}>{label}</span>
                        <span style={{ color: 'var(--paragraph)' }}>
                          {value[0]} – {value[1]}
                        </span>
                      </div>
                      <Slider
                        range
                        min={min}
                        max={max}
                        step={step}
                        value={value}
                        onChange={val => setConditionProps(prev => ({ ...prev, [key]: val }))}
                      />
                    </div>
                  );
                }
                return null;
              });
            })()}
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
