import React from 'react';
import WidgetEmbed from 'components-react/shared/WidgetEmbed';

/**
 * Full-page Widgets, embedded from the streamlabs.com dashboard. Opens the widget gallery;
 * navigation to individual widget settings happens inside the embed (core keeps the embed
 * params across vue-router navigation). Reached from the top-level side-nav.
 */
export default function Widgets(p: { params?: unknown; className?: string }) {
  return <WidgetEmbed product="widgets/gallery" className={p.className} />;
}
