import React, { useEffect, useMemo, useState } from 'react';
import { Button, InputNumber } from 'antd';
import * as remote from '@electron/remote';
import { ModalLayout } from 'components-react/shared/ModalLayout';
import Display from 'components-react/shared/Display';
import TestWidgets from 'components-react/root/TestWidgets';
import WidgetEmbed from 'components-react/shared/WidgetEmbed';
import { Services } from 'components-react/service-provider';
import { useSubscription } from 'components-react/hooks/useSubscription';
import { TObsFormData } from 'components/obs/inputs/ObsInput';
import { $t } from 'services/i18n';
import css from './WidgetSettingsEmbed.m.less';

// The settings embed gets a fixed, comfortable width; the preview takes the rest and grows
// with the window (mirrors the legacy WidgetEditor, where the preview is the large area).
const SETTINGS_WIDTH = 540;
const PREVIEW_MIN_WIDTH = 400;

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
 *   - Save Settings  → triggers the embedded page's own save via WidgetsService (see below).
 *   - Manage on Web  → opens the full web settings page in the external browser.
 *
 * Layout: a full-width header (Width/Height + Test Widgets), then a row with the native
 * `Display` preview on the left and the embed on the right, then a footer. The two OS overlays
 * (Display + BrowserView) live in separate left/right columns so they never share a rect.
 *
 * Save bridge: the embedded page exposes `window.__slobsWidgetSave()` in embed mode. The
 * native Save button calls WidgetsService.executeWidgetEmbedScript to invoke it without
 * holding a direct BrowserView reference — the manager owns all BrowserView refs.
 */
export default function WidgetSettingsEmbed() {
  const { WindowsService, SourcesService, WidgetsService, EditorCommandsService } = Services;

  const { sourceId } = WindowsService.getChildWindowQueryParams();

  const source = useMemo(() => SourcesService.views.getSource(sourceId), [sourceId]);

  const widget = useMemo(() => WidgetsService.getWidgetSource(sourceId), [sourceId]);

  // Static widget config (webSettingsUrl, testers, previewUrl) — no data fetch.
  const apiSettings = useMemo(() => widget?.getSettingsService()?.getApiSettings() ?? null, [
    widget,
  ]);

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
      // Shared domain BrowserView — don't evict on single source delete.
      // The discard timer will clean it up after the TTL.
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

  async function saveWebSettings() {
    // Trigger the embedded page's save via the bridge it exposes in embed mode. It saves only
    // when there are unsaved changes and resolves once the save settles. Close on success;
    // on failure keep the window open so the embed can surface the error.
    try {
      await WidgetsService.actions.return.executeWidgetEmbedScript(
        'streamlabs.com/dashboard:child',
        'window.__slobsWidgetSave ? window.__slobsWidgetSave() : Promise.resolve(true)',
      );
      WindowsService.actions.closeChildWindow();
    } catch {
      // Save failed — leave the window open; the embedded page shows the error.
    }
  }

  function openWebSettings() {
    if (apiSettings?.webSettingsUrl) remote.shell.openExternal(apiSettings.webSettingsUrl);
    WindowsService.actions.closeChildWindow();
  }

  const footer = (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
      }}
    >
      {apiSettings?.webSettingsUrl ? (
        <Button type="ghost" onClick={openWebSettings}>
          <i className="icon-pop-out-2" style={{ marginRight: 8 }} />
          {$t('Manage on Web')}
        </Button>
      ) : (
        <span />
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <Button onClick={() => WindowsService.actions.closeChildWindow()}>{$t('Close')}</Button>
        <Button type="primary" onClick={saveWebSettings}>
          {$t('Save Settings')}
        </Button>
      </div>
    </div>
  );

  return (
    <ModalLayout
      footer={footer}
      bodyStyle={{ padding: 0, display: 'flex', flexDirection: 'column' }}
    >
      {/* Header: Width/Height (left, inline) + Test Widgets (right) */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          padding: '8px 16px',
          borderBottom: '1px solid var(--border)',
          flex: '0 0 auto',
        }}
      >
        <div style={{ display: 'flex', gap: 16 }}>
          {dimensionProps.map(prop => (
            <div key={prop.name} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--paragraph)' }}>{prop.description}</span>
              <InputNumber
                style={{ width: 88 }}
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

      {/* Row: native Display preview (left, grows) + embedded settings form (right, fixed) */}
      <div style={{ display: 'flex', flex: '1 1 auto', minHeight: 0 }}>
        {previewSourceId && (
          <div
            style={{
              flex: '1 1 auto',
              minWidth: PREVIEW_MIN_WIDTH,
              background: 'var(--section)',
              borderRight: '1px solid var(--border)',
            }}
          >
            <Display sourceId={previewSourceId} style={{ position: 'relative', height: '100%' }} />
          </div>
        )}
        {/* The embed (WidgetEmbedView) needs a sized, positioned box. */}
        <div style={{ flex: `0 0 ${SETTINGS_WIDTH}px`, position: 'relative', minHeight: 0 }}>
          <WidgetEmbed cacheKey="streamlabs.com/dashboard:child" />
        </div>
      </div>
    </ModalLayout>
  );
}
