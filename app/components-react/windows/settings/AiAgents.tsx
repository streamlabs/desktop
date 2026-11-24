import React, { useEffect, useState } from 'react';
import { Button, Checkbox } from 'antd';
import { Services } from 'components-react/service-provider';
import { $t } from 'services/i18n';
import type { IAgentStatus, IConnectResult } from 'services/agent-connect';
import { ObsSettingsSection } from './ObsSettings';

/**
 * Settings > AI Agents: connect an AI agent (Hermes) to Streamlabs with one click.
 * The work happens in AgentConnectService; this page shows status, the button and the result.
 */
export function AiAgentsSettings() {
  const { AgentConnectService } = Services;
  const [status, setStatus] = useState<IAgentStatus | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [result, setResult] = useState<IConnectResult | null>(null);
  // Off by default: changing which profile Hermes opens affects the user's own setup.
  const [makeDefault, setMakeDefault] = useState(false);

  async function refresh() {
    setStatus(await AgentConnectService.actions.return.getStatus());
  }

  useEffect(() => {
    refresh();
  }, []);

  async function connect() {
    setConnecting(true);
    setResult(null);
    try {
      setResult(await AgentConnectService.actions.return.connectHermes(makeDefault));
    } catch (e: unknown) {
      setResult({
        ok: false,
        steps: [{ label: $t('Connect Hermes'), ok: false, detail: String(e) }],
      });
    } finally {
      setConnecting(false);
      refresh();
    }
  }

  const check = (ok: boolean | undefined) => (
    <i
      className={ok ? 'fa fa-check-circle' : 'fa fa-times-circle'}
      style={{ color: ok ? 'var(--teal)' : 'var(--red)', marginRight: 8 }}
    />
  );

  return (
    <>
      <ObsSettingsSection title={$t('AI Agents')}>
        <p>
          {$t(
            'Let an AI agent on this computer build and style your scenes, control your webcam effects and watch your stream health. Streamlabs runs the connection locally; nothing leaves this computer.',
          )}
        </p>
        {status && (
          <div style={{ lineHeight: '28px', marginBottom: 16 }}>
            <div>
              {check(status.mcpRunning)}
              {status.mcpRunning
                ? `${$t('Agent connection running at')} ${status.mcpUrl}`
                : $t('Agent connection is not running. Restart Streamlabs.')}
            </div>
            <div>
              {check(status.hermesFound)}
              {status.hermesFound ? $t('Hermes is installed') : $t('Hermes is not installed')}
            </div>
            <div>
              {check(!!status.nvidiaPort)}
              {status.nvidiaPort
                ? $t('NVIDIA Broadcast found')
                : $t('NVIDIA Broadcast not found (needed for webcam background effects)')}
            </div>
            <div>
              {check(status.profileExists)}
              {status.profileExists
                ? $t('Hermes has a Streamlabs profile')
                : $t('Hermes is not connected yet')}
            </div>
          </div>
        )}
        <p style={{ opacity: 0.7 }}>
          {$t(
            "Connecting creates a Streamlabs profile in Hermes from the profile you use now (its model and logins), and restarts Hermes' background service, so resend any chat that is in progress.",
          )}
        </p>
        <div style={{ marginBottom: 16 }}>
          <Checkbox
            checked={makeDefault}
            disabled={connecting}
            onChange={e => setMakeDefault(e.target.checked)}
          >
            {$t('Make default profile in Hermes')}
          </Checkbox>
          <div style={{ opacity: 0.7, marginLeft: 24 }}>
            {$t(
              'Leave this off to keep your Hermes setup as it is. You can pick the Streamlabs profile in Hermes when you want it.',
            )}
          </div>
        </div>
        {/* The section has no bottom padding: keep the button and results off its edge. */}
        <div style={{ paddingBottom: 16 }}>
          <Button
            type="primary"
            loading={connecting}
            disabled={connecting || !status?.hermesFound || !status?.mcpRunning}
            onClick={connect}
          >
            {status?.profileExists ? $t('Reconnect Hermes') : $t('Connect Hermes')}
          </Button>
          {connecting && (
            <p style={{ marginTop: 12 }}>{$t('Setting up Hermes. This takes up to a minute.')}</p>
          )}
          {result && (
            <div style={{ marginTop: 16, lineHeight: '26px' }}>
              {result.steps.map(s => (
                <div key={s.label}>
                  {check(s.ok)}
                  {s.label}
                  {s.detail && <span style={{ opacity: 0.7 }}> ({s.detail})</span>}
                </div>
              ))}
              {result.ok && result.next && (
                <p style={{ marginTop: 12, fontWeight: 'bold' }}>
                  {$t('Done.')} {result.next}
                </p>
              )}
            </div>
          )}
        </div>
      </ObsSettingsSection>
    </>
  );
}
