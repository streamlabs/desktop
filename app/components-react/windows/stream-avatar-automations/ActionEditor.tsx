import React from 'react';
import { Select, Tag } from 'antd';
import { alertAsync } from 'components-react/modals';
import { $t } from 'services/i18n';
import { ActionRegistry, withActionDefaults } from 'services/stream-avatar/engine/actions';
import type {
  ActionType,
  ExportedAction,
  ExportedActionProps,
} from 'services/stream-avatar/engine/actions';
import {
  AgentRequiredNotice,
  SceneSwitchControl,
  SourceVisibilityControl,
  WaitControl,
  InstructionControl,
  CoHostCommentControl,
  errorTextStyle,
  CONTROL_HEIGHT,
} from './ActionControls';
import styles from './AutomationEditor.m.less';

const dragHandleStyle = {
  cursor: 'grab',
  color: 'var(--paragraph)',
  fontSize: '16px',
} as const;

const gripCellStyle = {
  display: 'flex',
  alignItems: 'center',
  height: CONTROL_HEIGHT,
} as const;

const trashCellStyle = {
  display: 'flex',
  alignItems: 'center',
  height: CONTROL_HEIGHT,
  fontSize: '14px',
} as const;

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

  function renderControl() {
    switch (action.type) {
      case 'common.switch_to_scene':
        return (
          <SceneSwitchControl
            sceneName={sceneName}
            sceneMissing={sceneMissing}
            scenes={scenes}
            errors={errors}
            setProp={setProp}
          />
        );
      case 'common.show_source':
      case 'common.hide_source':
        return (
          <SourceVisibilityControl
            actionType={action.type}
            sourceName={sourceName}
            sourceMissing={sourceMissing}
            sources={sources}
            props={props}
            errors={errors}
            setProp={setProp}
          />
        );
      case 'common.wait_for_ms':
        return <WaitControl props={props} setProp={setProp} />;
      case 'co-host.instruction':
        if (!agentReady) {
          return (
            <AgentRequiredNotice
              isAgentInstalled={isAgentInstalled}
              onInstallAgent={() => void onInstallAgent()}
              onEnableAgent={onEnableAgent}
            />
          );
        }
        return <InstructionControl props={props} errors={errors} setProp={setProp} />;
      case 'co-host.comment':
        if (!agentReady) {
          return (
            <AgentRequiredNotice
              isAgentInstalled={isAgentInstalled}
              onInstallAgent={() => void onInstallAgent()}
              onEnableAgent={onEnableAgent}
            />
          );
        }
        return <CoHostCommentControl />;
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
