import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import cx from 'classnames';
import { Input } from 'antd';
import * as remote from '@electron/remote';
import { $t } from 'services/i18n';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import Scrollable from 'components-react/shared/Scrollable';
import { ModalLayout } from 'components-react/shared/ModalLayout';
import KevinSvg from 'components-react/shared/KevinSvg';
import styles from './KevinSupport.m.less';

// $t() must be called at render time, not module load, so the strings pick up a
// language change — and inline so they stay extractable.
const suggestedPrompts = () => [
  $t('Set up alerts & widgets'),
  $t('Connect streaming platform'),
  $t('Intelligent Streaming Agent'),
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

export default function KevinSupport() {
  const { KevinSupportService } = Services;

  const { messages, pending, error } = useVuex(() => ({
    messages: KevinSupportService.state.messages,
    pending: KevinSupportService.state.pending,
    error: KevinSupportService.state.error,
  }));

  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const isEmpty = useMemo(() => messages.length === 0, [messages.length]);

  useEffect(() => {
    KevinSupportService.actions.connect();
  }, []);

  useEffect(() => {
    // Scroll the OverlayScrollbars viewport itself. scrollIntoView() would walk up
    // and scroll every scrollable ancestor including the document, which drags the
    // window's title bar off the top of the screen.
    const viewport = listRef.current?.closest('.os-viewport') as HTMLElement | null;
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [messages.length, pending]);

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
        {isEmpty ? (
          <div className={styles.emptyState}>
            <KevinSvg style={{ width: 36, height: 32, fill: 'var(--paragraph)' }} />
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
                    <div className={styles.bubble}>{renderText(message.text)}</div>
                  </div>
                ))}
                {pending && (
                  <div className={cx(styles.message, styles.fromAgent)}>
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
              {suggestedPrompts().map(prompt => (
                <button key={prompt} className={styles.prompt} onClick={() => send(prompt)}>
                  {prompt}
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
        </button>
      </div>
    </ModalLayout>
  );
}
