import React, { CSSProperties, useEffect, useState } from 'react';
import { Select, Input } from 'antd';
import { ReactSortable } from 'react-sortablejs';
import uuid from 'uuid/v4';
import { ModalLayout } from 'components-react/shared/ModalLayout';
import { useVuex } from 'components-react/hooks';
import { Services } from 'components-react/service-provider';
import { $t } from 'services/i18n';
import { Conditions, GAME_NAMES, ConditionType } from 'services/stream-avatar/engine/conditions';
import { ActionRegistry, withActionDefaults } from 'services/stream-avatar/engine/actions';
import {
  validateAutomation,
  MAX_INSTRUCTION_LENGTH,
} from 'services/stream-avatar/engine/validation';
import type { TAutomationExport } from 'services/stream-avatar/engine/automations';
import type {
  ActionType,
  ExportedAction,
  ExportedActionProps,
} from 'services/stream-avatar/engine/actions';
import { TextInput, CheckboxInput, SliderInput } from 'components-react/shared/inputs';

const errorTextStyle: CSSProperties = {
  margin: '4px 0 0',
  color: 'var(--red)',
  fontSize: '12px',
};

// Drag-and-drop reordering needs a stable key per row that survives reorders and
// inserts (using the array index would make React/Sortable lose track on move).
interface ActionRow {
  id: string;
  action: ExportedAction;
}

function makeRow(action: ExportedAction): ActionRow {
  return { id: uuid(), action: withActionDefaults(action) };
}

// Height of a single control line, so the grip and +/- icons align with the
// action's primary input regardless of any extra rows (checkbox, slider) below.
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

const actionsCellStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  alignItems: 'center',
  gap: '10px',
  height: CONTROL_HEIGHT,
};

const iconButtonStyle: CSSProperties = {
  cursor: 'pointer',
  color: 'var(--icon-active)',
  fontSize: '16px',
};

const labelStyle: CSSProperties = {
  display: 'block',
  marginBottom: '4px',
  fontWeight: 600,
  color: 'var(--title)',
};

const ACTION_OPTIONS = Object.entries(ActionRegistry).map(([type, def]) => ({
  label: def.label,
  value: type as ActionType,
}));

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
  isFirst: boolean;
  scenes: { id: string; name: string }[];
  sources: { id: string; name: string }[];
  errors?: Record<string, string>;
  onChange: (index: number, action: ExportedAction) => void;
  onInsert: (index: number) => void;
  onRemove: (index: number) => void;
}

function ActionEditor({
  action,
  index,
  isFirst,
  scenes,
  sources,
  errors,
  onChange,
  onInsert,
  onRemove,
}: ActionEditorProps) {
  function setType(type: ActionType) {
    onChange(index, withActionDefaults({ type }));
  }

  function setProp(key: string, value: unknown) {
    onChange(index, {
      ...action,
      props: { ...(action.props as ExportedActionProps), [key]: value },
    });
  }

  const props = (action.props || {}) as ExportedActionProps;

  const sceneName = props.scene?.name ?? '';
  const sceneMissing = !!sceneName && !scenes.some(s => s.name === sceneName);
  const sourceName = props.source?.name ?? '';
  const sourceMissing = !!sourceName && !sources.some(s => s.name === sourceName);

  // The action's inline control (column 3), stacked vertically when it has more
  // than one row (e.g. a source select plus its checkbox).
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
        gridTemplateColumns: 'auto minmax(0, 1fr) minmax(0, 1fr) auto',
        gap: '12px',
        alignItems: 'start',
        padding: '12px 0',
        borderTop: isFirst ? 'none' : '1px solid var(--border)',
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
        value={action.type}
        onChange={val => setType(val as ActionType)}
        style={{ width: '100%' }}
        options={ACTION_OPTIONS}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
        {renderControl()}
      </div>

      <div style={actionsCellStyle}>
        <i
          className="icon-add"
          style={iconButtonStyle}
          title={$t('Insert a new action after this one')}
          onClick={() => onInsert(index)}
        />
        {isFirst ? (
          <span style={{ width: '16px', display: 'inline-block' }} />
        ) : (
          <i
            className="icon-subtract"
            style={iconButtonStyle}
            title={$t('Remove this action')}
            onClick={() => onRemove(index)}
          />
        )}
      </div>
    </div>
  );
}

interface Props {
  initial?: TAutomationExport;
  onClose: () => void;
}

export default function AutomationEditor({ initial, onClose }: Props) {
  const { AutomationsService, ScenesService, SourcesService } = Services;

  const { scenes, sources } = useVuex(() => ({
    scenes: ScenesService.views.scenes.map(s => ({ id: s.id, name: s.name })),
    sources: SourcesService.views.sources.map(s => ({ id: s.sourceId, name: s.name })),
  }));

  const [description, setDescription] = useState(initial?.description ?? '');
  const [selectedGame, setSelectedGame] = useState(() => {
    if (initial?.conditions?.[0]) {
      return (initial.conditions[0].type as string).split('.')[0];
    }
    return GAME_OPTIONS[0].value;
  });
  const [conditionType, setConditionType] = useState<ConditionType | ''>(() => {
    return (initial?.conditions?.[0]?.type as ConditionType) ?? '';
  });
  const [rows, setRows] = useState<ActionRow[]>(
    () =>
      (initial?.actions as ExportedAction[])?.filter(a => a?.type).map(makeRow) ?? [
        makeRow({ type: 'common.save_replay' }),
      ],
  );
  // `rows` carries the stable drag keys; `actions` is the plain ordered list the
  // validator and save payload consume.
  const actions = rows.map(r => r.action);
  // Enable/disable is managed from the list, not here; new automations default
  // to enabled and edits preserve the existing value.
  const enabled = initial?.enabled ?? true;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Required-field errors stay hidden on a fresh form until the first save
  // attempt; existing automations show them immediately so a deleted scene/
  // source surfaces the moment the editor opens.
  const [attempted, setAttempted] = useState(!!initial);

  const conditionOptions = getConditionOptions(selectedGame);

  const draft: TAutomationExport = {
    description,
    conditions: conditionType ? [{ type: conditionType }] : [],
    actions,
    enabled,
  };
  const issues = validateAutomation(draft, { scenes, sources });

  const descriptionError = attempted
    ? issues.find(i => i.scope === 'description')?.message
    : undefined;
  const conditionError = attempted
    ? issues.find(i => i.scope === 'conditions')?.message
    : undefined;
  // "Add at least one action" has no actionIndex; show it once a save is tried.
  const actionsError = attempted
    ? issues.find(i => i.scope === 'action' && i.actionIndex === undefined)?.message
    : undefined;
  // Per-action field errors render live so unavailable selections are obvious.
  const actionErrors: Record<number, Record<string, string>> = {};
  issues.forEach(i => {
    if (i.scope === 'action' && i.actionIndex !== undefined && i.field) {
      actionErrors[i.actionIndex] = actionErrors[i.actionIndex] ?? {};
      actionErrors[i.actionIndex][i.field] = i.message;
    }
  });

  useEffect(() => {
    // Reset condition selection when game changes
    if (conditionOptions.length > 0) {
      const current = conditionOptions.find(o => o.value === conditionType);
      if (!current) setConditionType(conditionOptions[0].value);
    } else {
      setConditionType('');
    }
  }, [selectedGame]);

  function handleActionChange(index: number, action: ExportedAction) {
    setRows(prev => prev.map((r, i) => (i === index ? { ...r, action } : r)));
  }

  function handleActionRemove(index: number) {
    setRows(prev => prev.filter((_, i) => i !== index));
  }

  function handleAddAction() {
    setRows(prev => [...prev, makeRow({ type: 'common.save_replay' })]);
  }

  // Insert a new action directly after `afterIndex` so steps can be added
  // between existing ones, not just appended.
  function handleInsertAction(afterIndex: number) {
    setRows(prev => {
      const next = [...prev];
      next.splice(afterIndex + 1, 0, makeRow({ type: 'common.save_replay' }));
      return next;
    });
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
        conditions: conditionType ? [{ type: conditionType }] : [],
        actions,
        enabled,
      };

      if (initial?.id) {
        await AutomationsService.actions.update(initial.id, payload);
      } else {
        await AutomationsService.actions.create(payload);
      }
      onClose();
    } catch (e: unknown) {
      setError((e as any)?.message ?? $t('Failed to save automation.'));
    } finally {
      setSaving(false);
    }
  }

  const getButtonText = () => {
    if (saving) return $t('Saving...');
    if (initial) return $t('Save Changes');
    return $t('Create Automation');
  };

  const footer = (
    <>
      <button className="button button--default" onClick={onClose} disabled={saving}>
        {$t('Back')}
      </button>
      <button
        className="button button--action"
        style={{ marginLeft: '8px' }}
        onClick={handleSave}
        disabled={saving}
      >
        {getButtonText()}
      </button>
    </>
  );

  return (
    <ModalLayout scrollable footer={footer}>
      <h2 style={{ marginTop: 0, color: 'var(--title)' }}>
        {initial ? $t('Edit Automation') : $t('New Automation')}
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Description */}
        <TextInput
          label={$t('Description')}
          value={description}
          onChange={val => setDescription(val)}
          placeholder={$t('e.g. Victory Royale reaction')}
          validateStatus={descriptionError ? 'error' : undefined}
          help={descriptionError}
        />

        {/* Condition */}
        <div>
          <label style={labelStyle}>{$t('When (Condition)')}</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Select
              value={selectedGame}
              onChange={val => setSelectedGame(val)}
              style={{ flex: '0 0 auto' }}
              options={GAME_OPTIONS}
              dropdownMatchSelectWidth={false}
            />
            <Select
              value={conditionType || undefined}
              onChange={val => setConditionType(val as ConditionType)}
              style={{ flex: 1, minWidth: 0 }}
              placeholder={
                conditionOptions.length === 0 ? $t('No conditions available') : undefined
              }
              options={conditionOptions}
            />
          </div>
          {conditionError && <p style={errorTextStyle}>{conditionError}</p>}
        </div>

        {/* Actions */}
        <div>
          <label style={{ ...labelStyle, marginBottom: '8px' }}>{$t('Do (Actions)')}</label>
          <ReactSortable<ActionRow>
            list={rows}
            setList={setRows}
            handle=".sa-action-drag-handle"
            animation={200}
            tag="div"
          >
            {rows.map((row, i) => (
              <div key={row.id}>
                <ActionEditor
                  action={row.action}
                  index={i}
                  isFirst={i === 0}
                  scenes={scenes}
                  sources={sources}
                  errors={actionErrors[i]}
                  onChange={handleActionChange}
                  onInsert={handleInsertAction}
                  onRemove={handleActionRemove}
                />
              </div>
            ))}
          </ReactSortable>
          {actionsError && <p style={errorTextStyle}>{actionsError}</p>}
          <button
            className="button button--default"
            onClick={handleAddAction}
            style={{ fontSize: '12px' }}
          >
            {$t('+ Add Action')}
          </button>
        </div>

        {error && <p style={{ color: 'var(--red)', margin: 0 }}>{error}</p>}
      </div>
    </ModalLayout>
  );
}
