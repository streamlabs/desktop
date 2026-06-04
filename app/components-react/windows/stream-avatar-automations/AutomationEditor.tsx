import React, { CSSProperties, useEffect, useState } from 'react';
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

const errorTextStyle: CSSProperties = {
  margin: '4px 0 0',
  color: 'var(--red)',
  fontSize: '12px',
};

function fieldBorder(invalid: boolean): CSSProperties {
  return { borderColor: invalid ? 'var(--red)' : 'var(--border)' };
}

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

const ACTION_OPTIONS = Object.entries(ActionRegistry).map(([type, def]) => ({
  type: type as ActionType,
  label: def.label,
}));

const GAME_OPTIONS = Object.entries(GAME_NAMES)
  .map(([id, name]) => ({ id, name }))
  .sort((a, b) => a.name.localeCompare(b.name));

function getConditionOptions(gameId: string) {
  return Object.entries(Conditions)
    .filter(([, def]) => def.group === gameId && !def.disabled)
    .map(([key, def]) => ({ type: key as ConditionType, label: def.label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

const inputStyle: CSSProperties = {
  background: 'var(--solid-input)',
  color: 'var(--title)',
  border: '1px solid var(--border)',
  borderRadius: '4px',
  padding: '4px 6px',
  boxSizing: 'border-box',
};

// Full-width control that lines up with the row's fixed control height.
const rowControlStyle: CSSProperties = {
  ...inputStyle,
  width: '100%',
  height: CONTROL_HEIGHT,
};

const labelStyle: CSSProperties = {
  display: 'block',
  marginBottom: '4px',
  fontWeight: 600,
  color: 'var(--title)',
};

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
      case 'common.switch_to_scene':
        return (
          <>
            <select
              value={sceneName}
              onChange={e => setProp('scene', { name: e.target.value })}
              style={{ ...rowControlStyle, ...fieldBorder(!!errors?.scene) }}
            >
              <option value="">{$t('— select scene —')}</option>
              {sceneMissing && (
                <option value={sceneName}>{`${sceneName} (${$t('unavailable')})`}</option>
              )}
              {scenes.map(s => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
            {errors?.scene && <p style={errorTextStyle}>{errors.scene}</p>}
          </>
        );

      case 'common.show_source':
      case 'common.hide_source':
        return (
          <>
            <select
              value={sourceName}
              onChange={e => setProp('source', { name: e.target.value })}
              style={{ ...rowControlStyle, ...fieldBorder(!!errors?.source) }}
            >
              <option value="">{$t('— select source —')}</option>
              {sourceMissing && (
                <option value={sourceName}>{`${sourceName} (${$t('unavailable')})`}</option>
              )}
              {sources.map(s => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
            {errors?.source && <p style={errorTextStyle}>{errors.source}</p>}
            {action.type === 'common.show_source' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                <input
                  type="checkbox"
                  checked={!!props.hide_if_condition_false}
                  onChange={e => setProp('hide_if_condition_false', e.target.checked)}
                />
                {$t('Hide if condition is false')}
              </label>
            )}
            {action.type === 'common.hide_source' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                <input
                  type="checkbox"
                  checked={!!props.show_if_condition_false}
                  onChange={e => setProp('show_if_condition_false', e.target.checked)}
                />
                {$t('Show if condition is false')}
              </label>
            )}
          </>
        );

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
            <input
              type="range"
              min={500}
              max={60000}
              step={500}
              value={props.duration ?? 5000}
              onChange={e => setProp('duration', Number(e.target.value))}
              style={{ width: '100%' }}
            />
          </>
        );

      case 'co-host.instruction':
        return (
          <>
            <input
              type="text"
              value={props.instruction ?? ''}
              onChange={e => setProp('instruction', e.target.value)}
              placeholder={$t('Instruction')}
              maxLength={MAX_INSTRUCTION_LENGTH}
              style={{ ...rowControlStyle, ...fieldBorder(!!errors?.instruction) }}
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

      <select
        value={action.type}
        onChange={e => setType(e.target.value as ActionType)}
        style={rowControlStyle}
      >
        {ACTION_OPTIONS.map(o => (
          <option key={o.type} value={o.type}>
            {o.label}
          </option>
        ))}
      </select>

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
    return GAME_OPTIONS[0].id;
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
      const current = conditionOptions.find(o => o.type === conditionType);
      if (!current) setConditionType(conditionOptions[0].type);
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
    } catch (e: any) {
      setError(e?.message ?? $t('Failed to save automation.'));
    } finally {
      setSaving(false);
    }
  }

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
        {saving ? $t('Saving...') : initial ? $t('Save Changes') : $t('Create Automation')}
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
        <div>
          <label style={labelStyle}>{$t('Description')}</label>
          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            maxLength={100}
            placeholder={$t('e.g. Victory Royale reaction')}
            style={{
              ...inputStyle,
              width: '100%',
              padding: '6px 8px',
              ...fieldBorder(!!descriptionError),
            }}
          />
          {descriptionError && <p style={errorTextStyle}>{descriptionError}</p>}
        </div>

        {/* Condition */}
        <div>
          <label style={labelStyle}>{$t('When (Condition)')}</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <select
              value={selectedGame}
              onChange={e => setSelectedGame(e.target.value)}
              style={{ ...inputStyle, padding: '6px 8px', flex: '0 0 auto' }}
            >
              {GAME_OPTIONS.map(g => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <select
              value={conditionType}
              onChange={e => setConditionType(e.target.value as ConditionType)}
              style={{ ...inputStyle, padding: '6px 8px', flex: 1, ...fieldBorder(!!conditionError) }}
            >
              {conditionOptions.length === 0 && (
                <option value="">{$t('No conditions available')}</option>
              )}
              {conditionOptions.map(c => (
                <option key={c.type} value={c.type}>
                  {c.label}
                </option>
              ))}
            </select>
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
          <button className="button button--default" onClick={handleAddAction} style={{ fontSize: '12px' }}>
            {$t('+ Add Action')}
          </button>
        </div>

        {error && <p style={{ color: 'var(--red)', margin: 0 }}>{error}</p>}
      </div>
    </ModalLayout>
  );
}
