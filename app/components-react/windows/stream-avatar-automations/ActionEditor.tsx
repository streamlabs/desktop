import React, { CSSProperties } from 'react';
import { Select, Input, Tag } from 'antd';
import { alertAsync } from 'components-react/modals';
import { $t } from 'services/i18n';
import { ActionRegistry, withActionDefaults } from 'services/stream-avatar/engine/actions';
import { MAX_INSTRUCTION_LENGTH } from 'services/stream-avatar/engine/validation';
import { CheckboxInput, SliderInput } from 'components-react/shared/inputs';
import type { ActionType, ExportedAction, ExportedActionProps } from 'services/stream-avatar/engine/actions';
import styles from './AutomationEditor.m.less';

const errorTextStyle: CSSProperties = {
  margin: '4px 0 0',
  color: 'var(--red)',
  fontSize: '12px',
};

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

export interface ActionEditorProps {
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

export default function ActionEditor({
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
