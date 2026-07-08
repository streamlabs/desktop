import React, { CSSProperties, useEffect, useState } from 'react';
import { Button, Select, Input, Slider, Tag } from 'antd';
import { Properties } from 'services/stream-avatar/engine/properties';
import { ReactSortable } from 'react-sortablejs';
import uuid from 'uuid/v4';
import { ModalLayout } from 'components-react/shared/ModalLayout';
import { alertAsync } from 'components-react/modals';
import { useVuex } from 'components-react/hooks';
import { useAgentAppInstalled } from 'components-react/hooks/useAgentAppInstalled';
import { Services } from 'components-react/service-provider';
import { $t } from 'services/i18n';
import { Conditions, GAME_NAMES, ConditionType } from 'services/stream-avatar/engine/conditions';
import { ActionRegistry, withActionDefaults } from 'services/stream-avatar/engine/actions';
import {
  validateAutomation,
  MAX_INSTRUCTION_LENGTH,
} from 'services/stream-avatar/engine/validation';
import type { TAutomationExport } from 'services/stream-avatar/engine/automations';
import { AutomationsAnalytics } from './AutomationsAnalytics';
import type {
  ActionType,
  ExportedAction,
  ExportedActionProps,
} from 'services/stream-avatar/engine/actions';
import { TextInput, CheckboxInput, SliderInput } from 'components-react/shared/inputs';
import styles from './AutomationEditor.m.less';

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

const CONTROL_HEIGHT = '32px';

const dragHandleStyle: CSSProperties = {
  cursor: 'grab',
  color: 'var(--paragraph)',
  fontSize: '16px',
};

const gripCellStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  height: CONTROL_HEIGHT,
};

const trashCellStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  height: CONTROL_HEIGHT,
  fontSize: '14px',
};

function requiresAgentApp(type: ActionType): boolean {
  return ActionRegistry[type]?.group === 'co-host';
}

function getActionOptions() {
  return Object.entries(ActionRegistry).map(([type, def]) => ({
    label: requiresAgentApp(type as ActionType) ? (
      <span>
        {def.label}{' '}
        <Tag style={{ fontSize: 10, lineHeight: '14px', padding: '0 4px', marginLeft: 2 }}>
          {$t('Requires ISA App')}
        </Tag>
      </span>
    ) : (
      def.label
    ),
    value: type as ActionType,
  }));
}

const GAME_OPTIONS = Object.entries(GAME_NAMES)
  .map(([id, name]) => ({ label: name, value: id }))
  .sort((a, b) => a.label.localeCompare(b.label));

function getConditionOptions(gameId: string) {
  return Object.entries(Conditions)
    .filter(([, def]) => def.group === gameId && !def.disabled)
    .map(([key, def]) => ({ label: def.label, value: key as ConditionType }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

interface ActionEditorProps {
  action: ExportedAction;
  index: number;
  scenes: { id: string; name: string }[];
  sources: { id: string; name: string }[];
  errors?: Record<string, string>;
  isAgentInstalled: boolean;
  isAgentEnabled: boolean;
  onInstallAgent: () => Promise<void>;
  onEnableAgent: () => void;
  onChange: (index: number, action: ExportedAction) => void;
  onRemove: (index: number) => void;
}

function ActionEditor({
  action,
  index,
  scenes,
  sources,
  errors,
  isAgentInstalled,
  isAgentEnabled,
  onInstallAgent,
  onEnableAgent,
  onChange,
  onRemove,
}: ActionEditorProps) {
  const agentReady = isAgentInstalled && isAgentEnabled;

  async function notifyAgentRequired() {
    if (!isAgentInstalled) {
      await alertAsync({
        type: 'confirm',
        title: $t('Intelligent Streaming Agent Required'),
        closable: true,
        content: (
          <span>
            {$t(
              'Co-host actions require the Intelligent Streaming Agent app. Install it to use this action.',
            )}
          </span>
        ),
        cancelText: $t('Cancel'),
        okText: $t('Install'),
        okButtonProps: { type: 'primary' },
        onOk: () => {
          void onInstallAgent();
        },
        cancelButtonProps: { style: { display: 'inline' } },
      });
      return;
    }

    await alertAsync({
      type: 'confirm',
      title: $t('Intelligent Streaming Agent Disabled'),
      closable: true,
      content: (
        <span>
          {$t(
            'The Intelligent Streaming Agent app is installed but currently disabled. Enable it to use this action.',
          )}
        </span>
      ),
      cancelText: $t('Cancel'),
      okText: $t('Enable'),
      okButtonProps: { type: 'primary' },
      onOk: () => {
        onEnableAgent();
      },
      cancelButtonProps: { style: { display: 'inline' } },
    });
  }

  function setType(type: ActionType) {
    onChange(index, withActionDefaults({ type }));
    // Always apply the selection — this is informational, not a gate, so it
    // can't leave the Select showing a value that was never actually set.
    if (requiresAgentApp(type) && !agentReady) {
      void notifyAgentRequired();
    }
  }

  function setProp(key: string, value: unknown) {
    onChange(index, {
      ...action,
      props: { ...(action.props as ExportedActionProps), [key]: value },
    });
  }

  const actionOptions = getActionOptions();

  const props = (action.props || {}) as ExportedActionProps;

  const sceneName = props.scene?.name ?? '';
  const sceneMissing = !!sceneName && !scenes.some(s => s.name === sceneName);
  const sourceName = props.source?.name ?? '';
  const sourceMissing = !!sourceName && !sources.some(s => s.name === sourceName);

  function renderAgentRequiredNotice() {
    if (!isAgentInstalled) {
      return (
        <p
          style={{
            margin: 0,
            minHeight: CONTROL_HEIGHT,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: '12px',
            color: 'var(--red)',
          }}
        >
          {$t('Requires the Intelligent Streaming Agent app.')}
          <a onClick={() => void onInstallAgent()}>{$t('Install')}</a>
        </p>
      );
    }

    return (
      <p
        style={{
          margin: 0,
          minHeight: CONTROL_HEIGHT,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: '12px',
          color: 'var(--red)',
        }}
      >
        {$t('The Intelligent Streaming Agent app is disabled.')}
        <a onClick={() => onEnableAgent()}>{$t('Enable')}</a>
      </p>
    );
  }

  function renderControl() {
    switch (action.type) {
      case 'common.switch_to_scene': {
        const sceneOptions = [
          ...(sceneMissing
            ? [{ label: `${sceneName} (${$t('unavailable')})`, value: sceneName }]
            : []),
          ...scenes.map(s => ({ label: s.name, value: s.name })),
        ];
        return (
          <>
            <Select
              value={sceneName || undefined}
              onChange={val => setProp('scene', { name: val })}
              style={{ width: '100%' }}
              placeholder={$t('— select scene —')}
              options={sceneOptions}
            />
            {errors?.scene && <p style={errorTextStyle}>{errors.scene}</p>}
          </>
        );
      }

      case 'common.show_source':
      case 'common.hide_source': {
        const sourceOptions = [
          ...(sourceMissing
            ? [{ label: `${sourceName} (${$t('unavailable')})`, value: sourceName }]
            : []),
          ...sources.map(s => ({ label: s.name, value: s.name })),
        ];
        return (
          <>
            <Select
              value={sourceName || undefined}
              onChange={val => setProp('source', { name: val })}
              style={{ width: '100%' }}
              placeholder={$t('— select source —')}
              options={sourceOptions}
            />
            {errors?.source && <p style={errorTextStyle}>{errors.source}</p>}
            {action.type === 'common.show_source' && (
              <CheckboxInput
                value={!!props.hide_if_condition_false}
                onChange={val => setProp('hide_if_condition_false', val)}
                label={$t('Hide if condition is false')}
              />
            )}
            {action.type === 'common.hide_source' && (
              <CheckboxInput
                value={!!props.show_if_condition_false}
                onChange={val => setProp('show_if_condition_false', val)}
                label={$t('Show if condition is false')}
              />
            )}
          </>
        );
      }

      case 'common.wait_for_ms':
        return (
          <>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                height: CONTROL_HEIGHT,
                fontSize: '12px',
              }}
            >
              <span style={{ fontWeight: 600, color: 'var(--title)' }}>{$t('Duration')}</span>
              <span style={{ color: 'var(--paragraph)' }}>
                {((props.duration ?? 5000) / 1000).toFixed(1)} {$t('seconds')}
              </span>
            </div>
            <SliderInput
              nowrap
              value={props.duration ?? 5000}
              onChange={val => setProp('duration', val)}
              min={500}
              max={60000}
              step={500}
              tipFormatter={(val: number) => `${(val / 1000).toFixed(1)}s`}
            />
          </>
        );

      case 'co-host.instruction':
        if (!agentReady) return renderAgentRequiredNotice();
        return (
          <>
            <Input
              value={props.instruction ?? ''}
              onChange={e => setProp('instruction', e.target.value)}
              placeholder={$t('Instruction')}
              maxLength={MAX_INSTRUCTION_LENGTH}
            />
            {errors?.instruction && <p style={errorTextStyle}>{errors.instruction}</p>}
          </>
        );

      case 'co-host.comment':
        if (!agentReady) return renderAgentRequiredNotice();
        return (
          <p
            style={{
              margin: 0,
              minHeight: CONTROL_HEIGHT,
              display: 'flex',
              alignItems: 'center',
              fontSize: '12px',
              color: 'var(--paragraph)',
            }}
          >
            {$t('The co-host will automatically comment based on the active game condition.')}
          </p>
        );

      default:
        return null;
    }
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1.2fr minmax(0, 1fr) auto',
        gap: '12px',
        alignItems: 'start',
        padding: '8px 0',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div style={gripCellStyle}>
        <i
          className="sa-action-drag-handle fas fa-grip-vertical"
          style={dragHandleStyle}
          title={$t('Drag to reorder')}
        />
      </div>

      <Select
        value={action.type || undefined}
        onChange={val => setType(val as ActionType)}
        placeholder={$t('Select an Action...')}
        options={actionOptions}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
        {renderControl()}
      </div>

      <div
        style={trashCellStyle}
        className={styles.trashIcon}
        onClick={() => onRemove(index)}
        title={$t('Remove reaction')}
      >
        <i className="icon-trash" />
      </div>
    </div>
  );
}

interface Props {
  initial?: TAutomationExport;
  onClose: () => void;
  onViewTemplates?: () => void;
}

export default function AutomationEditor({ initial, onClose, onViewTemplates }: Props) {
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
  // Filter rows without a selected type — they're unfinished UI placeholders.
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

  // ponytail: var avoids no-nested-ternary lint rule
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
        {onViewTemplates && (
          <Button
            type="link"
            onClick={onViewTemplates}
            style={{
              color: 'var(--paragraph)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <i className="fa fa-eye" />
            {$t('View Automation Templates')}
          </Button>
        )}
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

          {/* Condition-specific property inputs (e.g. elimination_count range) */}
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
