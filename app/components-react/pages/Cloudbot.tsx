import React from 'react';
import WidgetEmbed from 'components-react/shared/WidgetEmbed';

/**
 * Full-page Cloudbot settings, embedded from the streamlabs.com dashboard.
 * Reached from the top-level side-nav (see `menu-data.ts` → `EMenuItemKey.Cloudbot`).
 * Shares the domain BrowserView with AlertBox and Widgets — tab switches are SPA route changes.
 */
export default function Cloudbot(p: { params?: unknown; className?: string }) {
  return <WidgetEmbed product="cloudbot" className={p.className} cacheKey="streamlabs.com/dashboard" />;
}
