import React from 'react';
import { ModalLayout } from 'components-react/shared/ModalLayout';
import WidgetEmbed from 'components-react/shared/WidgetEmbed';

/**
 * Child-window host for a widget's streamlabs.com dashboard settings, embedded in the
 * source Properties window (opened from {@link SourcesService.showWidgetProperties} when the
 * widget type maps to a dashboard product). Replaces the native Properties form for widgets.
 *
 * The `product` is read from the window queryParams by {@link WidgetEmbed}. We use
 * `ModalLayout` (hidden footer, no body padding) so the embed fills the window below the
 * child TitleBar; the embed itself is a top-level Electron BrowserView, destroyed when the
 * window closes — so only one widget embed is ever resident.
 */
export default function WidgetSettingsEmbed() {
  return (
    <ModalLayout hideFooter bodyStyle={{ padding: 0 }}>
      <WidgetEmbed />
    </ModalLayout>
  );
}
