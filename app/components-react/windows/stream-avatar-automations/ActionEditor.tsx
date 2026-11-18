import React from 'react';
import { Select, Tag } from 'antd';
import cx from 'classnames';
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
} from './ActionControls';
import styles from './AutomationEditor.m.less';

function requiresAgentApp(type: ActionType): boolean {
  return ActionRegistry()[type]?.group === 'co-host';
}

function getActionOptions() {
  return Object.entries(ActionRegistry()).map(([type, def]) => ({
    label: requiresAgentApp(type as ActionType) ? (
      <span>
        {def.label}{' '}
        <Tag style={{ fontSize: 10, lineHeight: '14px', padding: '0 4px', marginLeft: 2 }}>
          {$t('Requires Sidekick App')}
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
  /** Unique names a Show/Hide Source reaction here can pick (see `source-scope`). */
  sourceNames: string[];
  /** Every source name, so an out-of-scope pick can be told apart from a deleted one. */
  allSourceNames: string[];
  /** The scenes those names are limited to; empty when any source is allowed. */
  scopeScenes: string[];
  errors?: Record<string, string>;
  isAgentInstalled: boolean;
  isAgentEnabled: boolean;
  streamEventsOnly?: boolean;
  onInstallAgent: () => Promise<void>;
  onEnableAgent: () => void;
  onChange: (index: number, action: ExportedAction) => void;
  onRemove: (index: number) => void;
}

export default function ActionEditor({
  action,
  index,
  scenes,
  sourceNames,
  allSourceNames,
  scopeScenes,
  errors,
  isAgentInstalled,
  isAgentEnabled,
  streamEventsOnly,
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
        title: $t('Sidekick Required'),
        closable: true,
        content: (
          <span>
            {$t('Co-host actions require the Sidekick app. Install it to use this action.')}
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
      title: $t('Sidekick Disabled'),
      closable: true,
      content: (
        <span>
          {$t(
            'The Sidekick app is installed but currently disabled. Enable it to use this action.',
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
  const sourceMissing = !!sourceName && !sourceNames.includes(sourceName);
  const sourceOutOfScope = sourceMissing && allSourceNames.includes(sourceName);

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
            sourceOutOfScope={sourceOutOfScope}
            sourceNames={sourceNames}
            scopeScenes={scopeScenes}
            props={props}
            errors={errors}
            setProp={setProp}
            hideUnmetOption={streamEventsOnly}
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
    <div className={styles.actionRow}>
      <div className={styles.gripCell}>
        <i
          className={cx('sa-action-drag-handle fas fa-grip-vertical', styles.dragHandle)}
          title={$t('Drag to reorder')}
        />
      </div>

      {/* The control column stays empty until an action is picked, so the select keeps half width */}
      <div className={styles.actionFields}>
        <Select
          value={action.type || undefined}
          onChange={val => setType(val as ActionType)}
          placeholder={$t('Select an Action...')}
          options={actionOptions}
        />
        <div className={styles.actionControl}>{renderControl()}</div>
      </div>

      <div
        className={cx(styles.actionTrash, styles.trashIcon)}
        onClick={() => onRemove(index)}
        title={$t('Remove reaction')}
      >
        <i className="icon-trash" />
      </div>
    </div>
  );
}
