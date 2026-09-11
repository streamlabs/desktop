import React, { useEffect, useLayoutEffect, useState } from 'react';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import { $t } from 'services/i18n';
import {
  browserViewRects,
  isCoveredByBrowserView,
  IViewRect,
} from 'components-react/shared/browser-view-rects';
import styles from './KevinApprovalBubble.m.less';

interface Props {
  /** The footer icon this points at. Measured, never positioned against. */
  anchorRef: React.RefObject<HTMLElement>;
}

/** Must match `.bubble` in KevinApprovalBubble.m.less. */
const BUBBLE_WIDTH = 320;
/** Must match the `bottom` offset applied below. */
const ANCHOR_GAP = 10;
// ponytail: a fixed cap rather than the rendered height. The bubble grows with the
// number of pending approvals, but anything covering it is essentially always the
// whole page container, so an exact height buys nothing — and measuring the bubble
// to decide whether to draw the bubble flickers.
const BUBBLE_MAX_HEIGHT = 240;

/**
 * The approval prompt, shown above the Kevin icon in the studio footer.
 *
 * An approval used to force the support window open and focus it, which is an
 * ambush mid-stream: a window jumps in front of whatever the streamer was doing,
 * for a decision that is usually a single "yes". This carries the whole decision
 * instead, so they answer without leaving the editor.
 *
 * Positioned `fixed` from the icon's measured rect rather than absolutely inside
 * the footer, because the footer scrolls: `.footer` sets `overflow-y: hidden`
 * and `overflow-x: auto`, and `.footer--left` another `overflow-x: auto`. A
 * child positioned above the bar is clipped by both, which is invisible rather
 * than merely misplaced. Fixed escapes that; it stays in the React tree so it
 * keeps inheriting the theme class's CSS variables.
 *
 * It duplicates the card in KevinSupport.tsx rather than sharing one, because
 * the two differ in everything but the three buttons: that one is a turn in a
 * conversation, this one is a floating callout with no room for an avatar or a
 * lead-in. Both call the same `resolveApproval`, which is the part that matters.
 *
 * It draws nothing when an Electron BrowserView covers where it would land —
 * plugin pages, the app store, Alertbox Library, a Browser editor element. Those
 * are composited by the OS above the entire host page, so no z-index reaches over
 * them and the bubble would render as the arrow alone. The fallback is the dot on
 * the footer icon (StudioFooter.tsx), which is below every such view and always
 * visible; clicking it opens the chat window, which is a real BrowserWindow and
 * carries the same card. The alternative was blanking the plugin for as long as
 * the approval sat unanswered, which is worse than one extra click.
 */
export default function KevinApprovalBubble({ anchorRef }: Props) {
  const { KevinSupportService, WindowsService } = Services;

  const { pendingApprovals, chatFocused } = useVuex(() => ({
    pendingApprovals: KevinSupportService.state.pendingApprovals,
    // The state entry is deleted when the window closes, so `undefined` covers
    // "closed" and `false` covers "open but behind something" in one read.
    chatFocused: !!WindowsService.state['kevin-support']?.isFocused,
  }));

  // Nothing to add when the streamer is already looking at the chat — the card
  // in there is the live surface, and two copies of one decision is worse than
  // one in the wrong place.
  const show = !chatFocused && pendingApprovals.length > 0;

  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    if (!show) return;
    const measure = () => setAnchor(anchorRef.current?.getBoundingClientRect() ?? null);
    measure();
    // ponytail: re-measured on resize only. The icon also shifts when the
    // performance metrics beside it change width, or if the footer is scrolled
    // horizontally — watch those with a ResizeObserver if it ever looks off.
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [show, anchorRef]);

  // This subscription is also what re-renders on navigation: moving to a plugin
  // page fires no resize, so nothing else here would notice the page went native.
  const [views, setViews] = useState<IViewRect[]>([]);

  useEffect(() => {
    const subscription = browserViewRects.subscribe(setViews);
    return () => subscription.unsubscribe();
  }, []);

  const occluded =
    !!anchor &&
    isCoveredByBrowserView(
      {
        left: anchor.left,
        top: anchor.top - ANCHOR_GAP - BUBBLE_MAX_HEIGHT,
        width: BUBBLE_WIDTH,
        height: BUBBLE_MAX_HEIGHT,
      },
      views,
    );

  if (!show || !anchor || occluded) return <></>;

  return (
    // role="alert" rather than "alertdialog": the content is what should be
    // announced, and an alertdialog would need a label naming a prompt whose
    // whole text is already the summary below.
    <div
      className={styles.bubble}
      role="alert"
      style={{ left: anchor.left, bottom: window.innerHeight - anchor.top + ANCHOR_GAP }}
    >
      {pendingApprovals.map(approval => (
        <div key={approval.approvalId} className={styles.approval}>
          <div className={styles.summary}>{approval.summary}</div>
          {approval.risk === 'irreversible' && (
            <div className={styles.warning}>{$t('This cannot be undone.')}</div>
          )}
          {approval.risk === 'external' && (
            <div className={styles.warning}>{$t('This will be visible to your viewers.')}</div>
          )}
          <div className={styles.actions}>
            <button
              className="button button--action"
              onClick={() =>
                KevinSupportService.actions.resolveApproval(
                  approval.approvalId,
                  'approve',
                  'footer',
                )
              }
            >
              {$t('Allow once')}
            </button>
            <button
              className="button button--default"
              onClick={() =>
                KevinSupportService.actions.resolveApproval(approval.approvalId, 'always', 'footer')
              }
            >
              {$t('Always allow')}
            </button>
            <button
              className="button button--default"
              onClick={() =>
                KevinSupportService.actions.resolveApproval(approval.approvalId, 'deny', 'footer')
              }
            >
              {$t('Deny')}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
