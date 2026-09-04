import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import cx from 'classnames';
import { Input, Tooltip } from 'antd';
import * as remote from '@electron/remote';
import { $t } from 'services/i18n';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import Scrollable from 'components-react/shared/Scrollable';
import { ModalLayout } from 'components-react/shared/ModalLayout';
import KevinSvg from 'components-react/shared/KevinSvg';
import UltraIcon from 'components-react/shared/UltraIcon';
import { KevinChatIcon, SendIcon } from 'components-react/shared/icons';
import {
  INTERACTION_LIMITS,
  ULTRA_PLUS_TIER,
  promptUpgrade,
  supportTier,
  upgrade,
} from './support-limits';
import styles from './KevinSupport.m.less';

// $t() must be called at render time, not module load, so the strings pick up a
// language change — and inline so they stay extractable. The chip's label and
// the message it sends are independent strings: a short label reads well as a
// pill, but the agent needs the actual question spelled out.
const suggestedPrompts = () => [
  { label: $t('Setup alerts & widgets'), prompt: $t('How do I setup alerts & widgets?') },
  { label: $t('Mute mic'), prompt: $t('Mute my microphone') },
  {
    label: $t('Connect streaming platforms'),
    prompt: $t('How do I connect more streaming platforms?'),
  },
  { label: $t('Sidekick'), prompt: $t('How do I setup Streamlabs Sidekick?') },
];

//        [label](url)              **bold**        *italic*      `code`
const INLINE_MD = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;

/**
 * ponytail: the agent's technical-assistant mode emits inline markdown only —
 * links, emphasis, the odd code span — never lists or headings, because its
 * system prompt forbids them. So one regex pass beats pulling in react-markdown.
 * Swap in a real renderer if replies ever start using block-level markdown.
 */
function renderText(text: string): React.ReactNode[] {
  // A fresh regex per call: emphasis recurses, and a shared /g literal would have
  // its lastIndex clobbered by the inner call — an infinite loop, not a wrong result.
  const re = new RegExp(INLINE_MD.source, 'g');
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // eslint-disable-next-line no-cond-assign
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));

    const [, label, url, bold, italic, code] = match;
    const key = `${match.index}`;

    if (url) {
      nodes.push(
        <a key={key} onClick={() => remote.shell.openExternal(url)} className={styles.link}>
          {label}
        </a>,
      );
    } else if (bold) {
      // Recurse so `**[label](url)**` stays a link instead of rendering raw.
      nodes.push(<strong key={key}>{renderText(bold)}</strong>);
    } else if (italic) {
      nodes.push(<em key={key}>{renderText(italic)}</em>);
    } else {
      nodes.push(<code key={key}>{code}</code>);
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

/**
 * Interactions used, top right, mirroring the Automations usage meter.
 *
 * Counts come from the server on every request, so this reflects the quota that
 * actually applies rather than one derived here. The tier constants are only
 * used to name the next tier's allowance in the tooltip and the upsell.
 */
function UsageMeter(p: { rateLimit: { current: number; maximum: number } | null }) {
  const tier = supportTier();
  const atTopTier = tier === ULTRA_PLUS_TIER;

  // The server reports the real counts, but only once it has handled a request,
  // so waiting for them left the meter absent until after the first message --
  // which is exactly when someone on the free tier most wants to see what their
  // allowance is. The tier's own limit stands in until then, the way the
  // Automations meter derives its numbers locally, and the server's figures
  // replace it the moment they arrive.
  const current = p.rateLimit?.current ?? 0;
  const maximum = p.rateLimit?.maximum ?? INTERACTION_LIMITS[tier] ?? INTERACTION_LIMITS.free;

  const pct = maximum > 0 ? Math.min(100, Math.round((current / maximum) * 100)) : 0;
  // maximum > 0 guards the degenerate case: 0 >= 0 would offer an upgrade to
  // someone whose quota simply has not been reported yet.
  const atCap = maximum > 0 && current >= maximum;

  return (
    <div className={styles.usageMeter}>
      <div className={styles.usageRow}>
        <span className={styles.usageText}>
          {$t('%{count}/%{max} interactions used', { count: current, max: maximum })}
        </span>
        <Tooltip
          title={$t(
            'Free includes %{free} interactions in total. Ultra includes %{ultra} a month and Ultra+ %{ultraPlus}.',
            {
              free: INTERACTION_LIMITS.free,
              ultra: INTERACTION_LIMITS.ultra,
              ultraPlus: INTERACTION_LIMITS[ULTRA_PLUS_TIER],
            },
          )}
        >
          <i className={`icon-information ${styles.usageInfo}`} />
        </Tooltip>
        <div className={styles.usageTrack}>
          <div
            className={cx(styles.usageFill, atCap && styles.usageFillFull)}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {atCap && !atTopTier && (
        <span className={styles.upgradeLink} onClick={() => upgrade(tier)}>
          <UltraIcon type="badge" />
          <span className={styles.upgradeText}>
            {tier === 'ultra' ? $t('Upgrade to Ultra+ for more') : $t('Upgrade to Ultra for more')}
          </span>
        </span>
      )}
      {atCap && atTopTier && (
        <span className={styles.atCapNote}>{$t('Monthly limit reached')}</span>
      )}
    </div>
  );
}

export default function KevinSupport() {
  const { KevinSupportService } = Services;

  const { messages, pending, error, pendingApprovals, rateLimit, rateLimitRefusals } = useVuex(
    () => ({
      messages: KevinSupportService.state.messages,
      pending: KevinSupportService.state.pending,
      error: KevinSupportService.state.error,
      pendingApprovals: KevinSupportService.state.pendingApprovals,
      rateLimit: KevinSupportService.state.rateLimit,
      rateLimitRefusals: KevinSupportService.state.rateLimitRefusals,
    }),
  );

  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // A pending approval is content, even with no messages behind it: an approval
  // raised by a voice request through the avatar plugin arrives on a Desktop
  // chat that has never been used. Gating purely on messages.length showed the
  // "How can we help you today?" empty state while an approval sat unanswered
  // in state, and the run expired.
  const isEmpty = useMemo(() => messages.length === 0 && pendingApprovals.length === 0, [
    messages.length,
    pendingApprovals.length,
  ]);

  useEffect(() => {
    KevinSupportService.actions.connect();
  }, []);

  // Every refused request gets an answer, which is how Automations behaves: it
  // prompts on each blocked action rather than once per period. Keyed on the
  // refusal count and not on `exceeded`, because that latches true for the rest
  // of the period and a later attempt would otherwise be swallowed in silence --
  // the quota error is no longer shown as a banner, so this modal is the only
  // thing that tells them why nothing happened.
  useEffect(() => {
    if (rateLimitRefusals > 0) promptUpgrade(supportTier());
  }, [rateLimitRefusals]);

  useEffect(() => {
    // Scroll the OverlayScrollbars viewport itself. scrollIntoView() would walk up
    // and scroll every scrollable ancestor including the document, which drags the
    // window's title bar off the top of the screen.
    const viewport = listRef.current?.closest('.os-viewport') as HTMLElement | null;
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [messages.length, pending, pendingApprovals.length]);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || pending) return;
      KevinSupportService.actions.sendMessage(trimmed);
      setDraft('');
    },
    [pending],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key !== 'Enter' || e.shiftKey) return;
      e.preventDefault();
      send(draft);
    },
    [draft, send],
  );

  return (
    <ModalLayout hideFooter className={styles.window} bodyClassName={styles.body}>
      <div className={styles.content}>
        <UsageMeter rateLimit={rateLimit} />

        {isEmpty ? (
          <div className={styles.emptyState}>
            <KevinChatIcon style={{ width: 40, height: 38, color: 'var(--paragraph)' }} />
            <h2 className={styles.emptyTitle}>{$t('How can we help you today?')}</h2>
            <p className={styles.emptyBody}>
              {$t(
                'Ask me any question about alerts, widgets, audio delay, or connected streaming platforms.',
              )}
            </p>
          </div>
        ) : (
          // Scrollable forwards `className` into OverlayScrollbars' options (a
          // scrollbar-theme name), not onto the DOM node — so the height has to be
          // constrained by this wrapper plus `style`, never by a CSS-module class.
          <div className={styles.messages}>
            <Scrollable style={{ height: '100%' }} isResizable={false}>
              <div ref={listRef}>
                {messages.map((message, i) => (
                  <div
                    key={`${message.interactionId}-${i}`}
                    className={cx(
                      styles.message,
                      message.isUser ? styles.fromUser : styles.fromAgent,
                    )}
                  >
                    {!message.isUser && (
                      <KevinSvg className={styles.avatar} style={{ fill: 'var(--teal)' }} />
                    )}
                    <div className={styles.bubble}>{renderText(message.text)}</div>
                  </div>
                ))}
                {/* An approval is a turn in the conversation, not a modal over
                    it: the agent asked for something and is waiting on an
                    answer. Rendering it inline also means it cannot be missed
                    behind another window. */}
                {pendingApprovals.length > 0 && messages.length === 0 && (
                  <div className={styles.approvalContext}>
                    {$t('Your avatar is asking permission for something you requested by voice.')}
                  </div>
                )}

                {pendingApprovals.map(approval => (
                  <div
                    key={approval.approvalId}
                    className={cx(styles.message, styles.fromAgent, styles.approval)}
                  >
                    <KevinSvg className={styles.avatar} style={{ fill: 'var(--teal)' }} />
                    <div className={styles.bubble}>
                      <div className={styles.approvalSummary}>{approval.summary}</div>
                      {approval.risk === 'irreversible' && (
                        <div className={styles.approvalWarning}>{$t('This cannot be undone.')}</div>
                      )}
                      {approval.risk === 'external' && (
                        <div className={styles.approvalWarning}>
                          {$t('This will be visible to your viewers.')}
                        </div>
                      )}
                      <div className={styles.approvalActions}>
                        <button
                          className="button button--action"
                          onClick={() =>
                            KevinSupportService.actions.resolveApproval(
                              approval.approvalId,
                              'approve',
                            )
                          }
                        >
                          {$t('Allow once')}
                        </button>
                        <button
                          className="button button--default"
                          onClick={() =>
                            KevinSupportService.actions.resolveApproval(
                              approval.approvalId,
                              'always',
                            )
                          }
                        >
                          {$t('Always allow')}
                        </button>
                        <button
                          className="button button--default"
                          onClick={() =>
                            KevinSupportService.actions.resolveApproval(approval.approvalId, 'deny')
                          }
                        >
                          {$t('Deny')}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {pending && pendingApprovals.length === 0 && (
                  <div className={cx(styles.message, styles.fromAgent)}>
                    <KevinSvg className={styles.avatar} style={{ fill: 'var(--teal)' }} />
                    <div className={styles.bubble}>
                      <i className="fa fa-spinner fa-pulse" />
                    </div>
                  </div>
                )}
              </div>
            </Scrollable>
          </div>
        )}

        {isEmpty && (
          <div className={styles.suggestions}>
            <span className={styles.suggestionsTitle}>{$t('Suggested Prompts')}</span>
            <div className={styles.promptRow}>
              {suggestedPrompts().map(({ label, prompt }) => (
                <button key={label} className={styles.prompt} onClick={() => send(prompt)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.composer}>
        <Input.TextArea
          className={styles.input}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={$t('Type your message...')}
          autoSize={{ minRows: 1, maxRows: 5 }}
          bordered={false}
        />
        <button
          className={cx('button button--action', styles.send)}
          disabled={pending || !draft.trim()}
          onClick={() => send(draft)}
        >
          {$t('Send')}
          <SendIcon />
        </button>
      </div>
    </ModalLayout>
  );
}
