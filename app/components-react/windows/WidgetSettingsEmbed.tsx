import React, { useEffect, useMemo, useState } from 'react';
import { Button, InputNumber } from 'antd';
import * as remote from '@electron/remote';
import { ModalLayout } from 'components-react/shared/ModalLayout';
import Display from 'components-react/shared/Display';
import TestWidgets from 'components-react/root/TestWidgets';
import WidgetEmbedWarm from 'components-react/shared/WidgetEmbedWarm';
import { Services } from 'components-react/service-provider';
import { useSubscription } from 'components-react/hooks/useSubscription';
import { TObsFormData } from 'components/obs/inputs/ObsInput';
import { IWidgetConfig } from 'services/widgets/widgets-config';
import { $t } from 'services/i18n';
import css from './WidgetSettingsEmbed.m.less';

/**
 * Child-window host for a widget's streamlabs.com dashboard settings, embedded in the source
 * Properties window (opened from {@link SourcesService.showWidgetProperties}). The embedded
 * page owns the settings form; this shell restores the natively-owned affordances the legacy
 * `WidgetEditor` had:
 *   - Width/Height   → OBS browser-source props, written straight to the source (immediate).
 *   - Preview        → native OBS `Display` on a temporary preview source (like the legacy
 *                      WidgetEditor): it uses the widget's `previewUrl` with `shutdown: false`
 *                      so it always renders (the real source is black when idle), and is kept
 *                      in sync with the real source's settings. Test Widgets shows here.
 *   - Test Widgets   → fires a test event into the preview.
 *   - Manage on Web  → opens the full web settings page in the external browser.
 *
 * Layout lives in WidgetSettingsEmbed.m.less: a full-width header (Width/Height + Test Widgets),
 * then a row with the native `Display` preview on the left and the embed on the right, then a
 * footer. The two OS overlays (Display + BrowserView) sit in separate left/right columns so they
 * never share a rect.
 *
 * There is no Save button. The embedded page auto-saves as the user edits, matching what the
 * legacy `WidgetEditor` did — and it has to, because saving is the only thing that reaches the
 * preview above: the backend broadcasts a settings-update socket event on save and the overlay
 * applies (or reloads on) it. The page's in-page draft channel was a local `postMessage` to a
 * preview iframe that embed mode strips, so without a save nothing here would ever change.
 *
 * Closing flushes whatever the page still has debounced, so a change made in the last second
 * isn't dropped. That lives in `WidgetEmbedViewService.unmount()` rather than in the Close
 * handler here, because the titlebar X and Escape never reach this footer at all.
 */
export default function WidgetSettingsEmbed() {
  const { WindowsService, SourcesService, WidgetsService, EditorCommandsService } = Services;

  const { sourceId } = WindowsService.getChildWindowQueryParams();

  const source = useMemo(() => SourcesService.views.getSource(sourceId), [sourceId]);

  const widget = useMemo(() => WidgetsService.getWidgetSource(sourceId), [sourceId]);

  // Static widget config (webSettingsUrl, testers, previewUrl) — no data fetch.
  //
  // Prefer the new-style `widgetsConfig` entry and fall back to the legacy per-widget settings
  // service. Not every widget still has one: the native settings services for the types this
  // embed replaces (ChatBox, EventList, ...) have been deleted, so `getSettingsService()`
  // returns null for them.
  const apiSettings = useMemo(() => {
    if (!widget) return null;
    // Keyed by the subset of widget types ported to the new config, so a miss is expected.
    const configs: Partial<Record<number, IWidgetConfig>> = WidgetsService.widgetsConfig;
    const config = configs[widget.type];
    if (config) return config;
    const settingsService = widget.getSettingsService();
    return settingsService ? settingsService.getApiSettings() : null;
  }, [widget]);

  const [properties, setProperties] = useState<TObsFormData>(() =>
    source ? source.getPropertiesFormData() : [],
  );

  // A temporary preview source (previewUrl + shutdown:false) so the widget always renders in
  // the Display; destroyed on close. Mirrors the legacy WidgetEditor.
  const [previewSourceId, setPreviewSourceId] = useState('');
  useEffect(() => {
    if (!widget) return undefined;
    if (!widget.previewSourceId) widget.createPreviewSource();
    setPreviewSourceId(widget.previewSourceId);
    return () => {
      if (widget.previewSourceId) widget.destroyPreviewSource();
      setPreviewSourceId('');
    };
  }, [widget]);

  // Close the window if this source is deleted; refresh props if it changes elsewhere.
  useSubscription(SourcesService.sourceRemoved, removed => {
    if (source && removed.sourceId === source.sourceId) {
      WindowsService.actions.closeChildWindow();
    }
  });
  useSubscription(SourcesService.sourceUpdated, updated => {
    if (source && updated.sourceId === source.sourceId) {
      setProperties(source.getPropertiesFormData());
    }
  });

  // Width/Height are OBS browser-source props — native, persisted immediately on change.
  const dimensionProps = properties.filter(p => p.name === 'width' || p.name === 'height');

  function commitDimension(prop: TObsFormData[number], value: number | null) {
    if (!source || value == null) return;
    const updated = { ...prop, value } as TObsFormData[number];
    EditorCommandsService.executeCommand('EditSourcePropertiesCommand', source.sourceId, [updated]);
    setProperties(source.getPropertiesFormData());
  }

  function openWebSettings() {
    if (apiSettings?.webSettingsUrl) remote.shell.openExternal(apiSettings.webSettingsUrl);
    WindowsService.actions.closeChildWindow();
  }

  const footer = (
    <div className={css.footer}>
      {apiSettings?.webSettingsUrl ? (
        <Button type="ghost" onClick={openWebSettings}>
          <i className={`icon-pop-out-2 ${css.footerIcon}`} />
          {$t('Manage on Web')}
        </Button>
      ) : (
        <span />
      )}
      <div className={css.footerActions}>
        <Button type="primary" onClick={() => WindowsService.actions.closeChildWindow()}>
          {$t('Close')}
        </Button>
      </div>
    </div>
  );

  return (
    <ModalLayout footer={footer} bodyClassName={css.body}>
      <div className={css.header}>
        <div className={css.dimensions}>
          {dimensionProps.map(prop => (
            <div key={prop.name} className={css.dimension}>
              <span className={css.dimensionLabel}>{prop.description}</span>
              <InputNumber
                className={css.dimensionInput}
                min={0}
                value={prop.value as number}
                onChange={val => commitDimension(prop, val as number | null)}
              />
            </div>
          ))}
        </div>
        {apiSettings?.testers && (
          <div className={`button button--action ${css.testButton}`}>
            <TestWidgets testers={apiSettings.testers} />
          </div>
        )}
      </div>

      <div className={css.row}>
        {previewSourceId && (
          <div className={css.preview}>
            <Display sourceId={previewSourceId} style={{ position: 'relative', height: '100%' }} />
          </div>
        )}
        <div className={css.embed}>
          <WidgetEmbedWarm slot="properties" />
        </div>
      </div>
    </ModalLayout>
  );
}
