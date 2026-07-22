import React from 'react';
import WidgetEmbed from 'components-react/shared/WidgetEmbed';

/**
 * Full-page Alert Box settings, embedded from the streamlabs.com dashboard.
 * Reached from the top-level side-nav (see `menu-data.ts` → `EMenuItemKey.AlertBox`).
 * Shares the domain BrowserView with Cloudbot and Widgets — tab switches are SPA route changes.
 */
export default function AlertBox(p: { params?: unknown; className?: string }) {
  return <WidgetEmbed product="alertbox" className={p.className} cacheKey="streamlabs.com/dashboard" />;
}
