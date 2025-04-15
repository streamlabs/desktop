import React, { useMemo, useState } from 'react';
import { useObsSettings } from './useObsSettings';
import {
  IObsSectionedFormGroupProps,
  ObsCollapsibleFormGroup,
  ObsForm,
} from 'components-react/obs/ObsForm';
import Tabs from 'components-react/shared/Tabs';
import { $t } from 'services/i18n';
import cloneDeep from 'lodash/cloneDeep';
import { TObsFormData } from 'components/obs/inputs/ObsInput';

export function OutputSettings() {
  const { settingsFormData, saveSettings } = useObsSettings();

  const type = settingsFormData[0].parameters[0].currentValue === 'Simple' ? 'collapsible' : 'tabs';

  function onChange(formData: TObsFormData, ind: number) {
    const newVal = cloneDeep(settingsFormData);
    newVal[ind].parameters = formData;
    saveSettings(newVal);
  }
  const sections = settingsFormData.filter(
    section => section.parameters.filter(p => p.visible).length,
  );

  return (
    <div className="form-groups" style={{ paddingBottom: '12px' }}>
      {type === 'tabs' && <ObsTabbedOutputFormGroup sections={sections} onChange={onChange} />}

      {type === 'collapsible' && (
        <ObsCollapsibleFormGroup sections={sections} onChange={onChange} />
      )}
    </div>
  );
}

export function ObsTabbedOutputFormGroup(p: IObsSectionedFormGroupProps) {
  const tabs = useMemo(() => {
    // combine all audio tracks into one tab
    const filtered = p.sections
      .filter(sectionProps => sectionProps.nameSubCategory !== 'Untitled')
      .filter(sectionProps => !sectionProps.nameSubCategory.startsWith('Audio - Track'))
      .map(sectionProps => sectionProps.nameSubCategory);

    filtered.splice(2, 0, 'Audio');
    return filtered;
  }, [p.sections]);

  const [currentTab, setCurrentTab] = useState(p.sections[1].nameSubCategory);

  return (
    <div className="section" key="tabbed-section" style={{ marginBottom: '24px' }}>
      {p.sections.map((sectionProps, ind) => (
        <div className="section-content" key={`${sectionProps.nameSubCategory}${ind}`}>
          {sectionProps.nameSubCategory === 'Untitled' && (
            <>
              <ObsForm
                value={sectionProps.parameters}
                onChange={formData => p.onChange(formData, ind)}
              />
              <Tabs tabs={tabs} onChange={setCurrentTab} style={{ marginBottom: '24px' }} />
            </>
          )}

          {sectionProps.nameSubCategory === currentTab && (
            <ObsForm
              name={sectionProps.nameSubCategory}
              value={sectionProps.parameters}
              onChange={formData => p.onChange(formData, ind)}
            />
          )}

          {currentTab === 'Audio' && sectionProps.nameSubCategory.startsWith('Audio - Track') && (
            <div
              style={{
                backgroundColor: 'var(--section-wrapper)',
                padding: '15px',
                marginBottom: '30px',
                borderRadius: '5px',
              }}
            >
              <h2 className="section-title">{$t(sectionProps.nameSubCategory)}</h2>
              <ObsForm
                value={sectionProps.parameters}
                onChange={formData => p.onChange(formData, ind)}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

OutputSettings.page = 'Output';
