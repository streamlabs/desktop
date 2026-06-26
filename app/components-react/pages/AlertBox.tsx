import React from 'react';
import WidgetEmbed from 'components-react/shared/WidgetEmbed';

/**
 * Full-page Alert Box settings, embedded from the streamlabs.com dashboard.
 * Reached from the top-level side-nav (see `menu-data.ts` → `EMenuItemKey.AlertBox`).
 */
export default function AlertBox(p: { params?: unknown; className?: string }) {
  return <WidgetEmbed product="alertbox" className={p.className} />;
}
