import React from 'react';
import WidgetEmbed from 'components-react/shared/WidgetEmbed';

/**
 * Full-page Widgets gallery, embedded from the streamlabs.com dashboard. Opens the widget
 * gallery; navigation to individual widget settings happens inside the embed. Reached from
 * the top-level side-nav.
 * Shares the domain BrowserView with Cloudbot and AlertBox — tab switches are SPA route changes.
 */
export default function Widgets(p: { params?: unknown; className?: string }) {
  return <WidgetEmbed product="widgets/gallery" className={p.className} cacheKey="streamlabs.com/dashboard" />;
}
