import React, { CSSProperties, HTMLAttributes, useMemo, useState } from 'react';
import { ObsFormGroup } from '../../obs/ObsForm';
import Form from '../../shared/inputs/Form';
import Tabs from 'components-react/shared/Tabs';
import { Services } from '../../service-provider';
import { ISettingsSubCategory, TCategoryName } from '../../../services/settings';
import { TDisplayType } from 'services/settings-v2';
import { useVuex } from 'components-react/hooks';
import { useRealmObject } from 'components-react/hooks/realm';

export type IObsFormType = 'default' | 'tabs' | 'collapsible';

export function useObsSettings(page?: TCategoryName) {
  const { SettingsService, NavigationService } = Services;
  const [display, setDisplay] = useState<TDisplayType>('horizontal');

  const category = useRealmObject(NavigationService.state).currentSettingsTab;

  const memoizedPage = useMemo(() => {
    if (page) return page;
    if (category) return category;
    return 'General';
  }, [page, category]);

  function saveSettings(newSettings: ISettingsSubCategory[]) {
    SettingsService.actions.setSettings(memoizedPage, newSettings);
  }

  const { settingsFormData } = useVuex(() => ({
    settingsFormData: SettingsService.state[memoizedPage]?.formData ?? {},
  }));

  return { settingsFormData, saveSettings, display, setDisplay };
}

/**
 * Renders generic inputs from OBS
 */
export function ObsGenericSettingsForm(p: { type?: IObsFormType; page?: TCategoryName }) {
  const { settingsFormData, saveSettings, setDisplay } = useObsSettings(p.page);

  // TODO: Comment in when switched to new API
  // const showTabs = ['Output', 'Audio', 'Advanced'].includes(p.page);
  const showTabs = false;
  return (
    <>
      {showTabs && <Tabs onChange={setDisplay} />}
      <ObsFormGroup
        value={settingsFormData}
        onChange={newSettings => saveSettings(newSettings)}
        type={p?.type}
      />
    </>
  );
}

/**
 * A section layout for settings
 */
export function ObsSettingsSection(
  p: HTMLAttributes<unknown> & { title?: string; style?: CSSProperties },
) {
  return (
    <div className="section" style={p.style}>
      {p.title && <h2>{p.title}</h2>}
      <div className="section-content">
        <Form layout="vertical">{p.children}</Form>
      </div>
    </div>
  );
}
