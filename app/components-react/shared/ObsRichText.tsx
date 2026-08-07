import React, { createElement, useMemo } from 'react';
import * as remote from '@electron/remote';

/**
 * Renders the Qt rich text libobs puts in OBS_TEXT_INFO descriptions. Tags are rebuilt from an
 * allowlist rather than injected, and links open externally so they can't navigate the window.
 */
export default function ObsRichText(p: { text: string }) {
  const nodes = useMemo(
    () => Array.from(new DOMParser().parseFromString(p.text ?? '', 'text/html').body.childNodes),
    [p.text],
  );

  return <span>{nodes.map(renderNode)}</span>;
}

const INLINE_TAGS = ['b', 'strong', 'i', 'em', 'code', 'span', 'p'];

// dropped with their contents; other unknown tags keep their text
const OPAQUE_TAGS = ['script', 'style'];

const CODE_STYLE: React.CSSProperties = {
  fontFamily: 'monospace',
  whiteSpace: 'nowrap', // launch flags; wrapping mid-token reads as a typo
  background: 'var(--section-alt)',
  borderRadius: '2px',
  padding: '0 3px',
};

// colour comes from the global `a` rule
const LINK_STYLE: React.CSSProperties = {
  textDecoration: 'underline',
  cursor: 'pointer',
};

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

    return (
      <a
        key={key}
        style={LINK_STYLE}
        onClick={e => {
          e.preventDefault();
          remote.shell.openExternal(href);
        }}
      >
        {renderChildren(node)}
      </a>
    );
  }

  if (INLINE_TAGS.includes(tag)) {
    return createElement(
      tag,
      { key, style: tag === 'code' ? CODE_STYLE : undefined },
      renderChildren(node),
    );
  }

  // Unknown tag: drop it, keep its text.
  return <React.Fragment key={key}>{renderChildren(node)}</React.Fragment>;
}
