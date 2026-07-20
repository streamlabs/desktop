import React, { CSSProperties } from 'react';
import { Select, Input } from 'antd';
import { $t } from 'services/i18n';
import { MAX_INSTRUCTION_LENGTH } from 'services/stream-avatar/engine/validation';
import { CheckboxInput, SliderInput } from 'components-react/shared/inputs';
import type { ExportedActionProps } from 'services/stream-avatar/engine/actions';

export const CONTROL_HEIGHT = '32px';

export const errorTextStyle: CSSProperties = {
  margin: '4px 0 0',
  color: 'var(--red)',
  fontSize: '12px',
};

const agentNoticeStyle: CSSProperties = {
  margin: 0,
  minHeight: CONTROL_HEIGHT,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: '12px',
  color: 'var(--red)',
};

type SetProp = (key: string, value: unknown) => void;

// ── Agent notice ──────────────────────────────────────────────────────────────

interface AgentRequiredNoticeProps {
  isAgentInstalled: boolean;
  onInstallAgent: () => void;
  onEnableAgent: () => void;
}

export function AgentRequiredNotice({
  isAgentInstalled,
  onInstallAgent,
  onEnableAgent,
}: AgentRequiredNoticeProps) {
  if (!isAgentInstalled) {
    return (
      <p style={agentNoticeStyle}>
        {$t('Requires the Intelligent Streaming Agent app.')}
        <a onClick={onInstallAgent}>{$t('Install')}</a>
      </p>
    );
  }
  return (
    <p style={agentNoticeStyle}>
      {$t('The Intelligent Streaming Agent app is disabled.')}
      <a onClick={onEnableAgent}>{$t('Enable')}</a>
    </p>
  );
}

// ── Action controls ───────────────────────────────────────────────────────────

interface SceneSwitchControlProps {
  sceneName: string;
  sceneMissing: boolean;
  scenes: { id: string; name: string }[];
  errors?: Record<string, string>;
  setProp: SetProp;
}

export function SceneSwitchControl({
  sceneName,
  sceneMissing,
  scenes,
  errors,
  setProp,
}: SceneSwitchControlProps) {
  const sceneOptions = [
    ...(sceneMissing ? [{ label: `${sceneName} (${$t('unavailable')})`, value: sceneName }] : []),
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

interface SourceVisibilityControlProps {
  actionType: 'common.show_source' | 'common.hide_source';
  sourceName: string;
  sourceMissing: boolean;
  sources: { id: string; name: string }[];
  props: ExportedActionProps;
  errors?: Record<string, string>;
  setProp: SetProp;
}

export function SourceVisibilityControl({
  actionType,
  sourceName,
  sourceMissing,
  sources,
  props,
  errors,
  setProp,
}: SourceVisibilityControlProps) {
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
      {actionType === 'common.show_source' && (
        <CheckboxInput
          value={!!props.hide_if_condition_false}
          onChange={val => setProp('hide_if_condition_false', val)}
          label={$t('Hide if condition is false')}
        />
      )}
      {actionType === 'common.hide_source' && (
        <CheckboxInput
          value={!!props.show_if_condition_false}
          onChange={val => setProp('show_if_condition_false', val)}
          label={$t('Show if condition is false')}
        />
      )}
    </>
  );
}

interface WaitControlProps {
  props: ExportedActionProps;
  setProp: SetProp;
}

export function WaitControl({ props, setProp }: WaitControlProps) {
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
}

interface InstructionControlProps {
  props: ExportedActionProps;
  errors?: Record<string, string>;
  setProp: SetProp;
}

export function InstructionControl({ props, errors, setProp }: InstructionControlProps) {
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
}

export function CoHostCommentControl() {
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
}
