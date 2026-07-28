import React from 'react';
import WidgetEmbedWarm from 'components-react/shared/WidgetEmbedWarm';

/**
 * Full-page Cloudbot settings, embedded from the streamlabs.com dashboard.
 * Reached from the top-level side-nav (see `menu-data.ts` → `EMenuItemKey.Cloudbot`).
 */
export default function Cloudbot(p: { params?: unknown; className?: string }) {
  return <WidgetEmbedWarm slot="page" product="cloudbot" className={p.className} />;
}
