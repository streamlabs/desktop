import React, { createElement, useMemo } from 'react';
import * as remote from '@electron/remote';
import styles from './ObsRichText.m.less';

/**
 * Renders the Qt rich text libobs puts in OBS_TEXT_INFO descriptions. Tags are rebuilt from an
 * allowlist rather than injected, and links open externally so they can't navigate the window.
 */
export default function ObsRichText(p: { text: string }) {
  const nodes = useMemo(
    () => Array.from(new DOMParser().parseFromString(p.text ?? '', 'text/html').body.childNodes),
    [p.text],
  );

  // a block wrapper, not a span: it is a flex item and the allowlist permits <p>
  return <div>{nodes.map(renderNode)}</div>;
}

const INLINE_TAGS = ['b', 'strong', 'i', 'em', 'code', 'span', 'p'];

// dropped with their contents; other unknown tags keep their text
const OPAQUE_TAGS = ['script', 'style'];

function renderChildren(node: Node) {
  return Array.from(node.childNodes).map(renderNode);
}

function renderNode(node: Node, key: number): React.ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const tag = (node as Element).tagName.toLowerCase();

  if (OPAQUE_TAGS.includes(tag)) return null;

  if (tag === 'br') return <br key={key} />;

  if (tag === 'a') {
    const href = (node as Element).getAttribute('href') ?? '';
    if (!/^https?:\/\//i.test(href)) {
      return <React.Fragment key={key}>{renderChildren(node)}</React.Fragment>;
    }

    // no href, so it needs an explicit role and key handling to stay reachable
    const open = () => remote.shell.openExternal(href);
    return (
      <a
        key={key}
        role="link"
        tabIndex={0}
        className={styles.link}
        onClick={e => {
          e.preventDefault();
          open();
        }}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            open();
          }
        }}
      >
        {renderChildren(node)}
      </a>
    );
  }

  if (INLINE_TAGS.includes(tag)) {
    return createElement(
      tag,
      { key, className: tag === 'code' ? styles.code : undefined },
      renderChildren(node),
    );
  }

  // Unknown tag: drop it, keep its text.
  return <React.Fragment key={key}>{renderChildren(node)}</React.Fragment>;
}
