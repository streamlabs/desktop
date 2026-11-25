import React, { useEffect, useMemo, useState } from 'react';
import { useObsSettings } from './ObsSettings';
import {
  IObsSectionedFormGroupProps,
  ObsCollapsibleFormGroup,
  ObsForm,
} from 'components-react/obs/ObsForm';
import Tabs from 'components-react/shared/Tabs';
import { $t } from 'services/i18n';
import cloneDeep from 'lodash/cloneDeep';
import { IObsListInput, TObsFormData, TObsValue } from 'components/obs/inputs/ObsInput';
import {
  convertFileFormatToRecordingFormat,
  EFileFormat,
  ISettingsSubCategory,
  TOutputSettingsMode,
} from 'services/settings';
import { Services } from 'components-react/service-provider';
import { recordingEncoderSelection } from './recording-encoder-selection';

interface IOutputEdit {
  section: string;
  name: string;
  value: TObsValue;
}

function applyEdits(settings: ISettingsSubCategory[], edits: IOutputEdit[]) {
  const result = cloneDeep(settings);
  for (const edit of edits) {
    const field = result
      .find(s => s.nameSubCategory === edit.section)
      ?.parameters.find(p => p.name === edit.name);
    if (field) field.value = edit.value;
  }
  return result;
}

function encoderField(section: string, name: string) {
  return (
    (section === 'Recording' && ['RecFormat', 'RecEncoder', 'RecQuality'].includes(name)) ||
    (section === 'Streaming' && ['StreamEncoder', 'Encoder'].includes(name))
  );
}

export function OutputSettings() {
  const { settingsFormData, saveSettings } = useObsSettings('Output');

  const saved: ISettingsSubCategory[] = settingsFormData;
  const mode = saved[0].parameters[0].value as TOutputSettingsMode;
  const type = mode === 'Simple' ? 'collapsible' : 'tabs';
  const savedRecording = saved.find(s => s.nameSubCategory === 'Recording');
  const format = savedRecording?.parameters.find(
    p => p.name === 'RecFormat',
  ) as IObsListInput<EFileFormat>;
  const choices = useMemo(() => {
    if (!format?.enabled) return {};
    const formats = format.options
      .map(o => convertFileFormatToRecordingFormat(o.value))
      .filter(f => f !== undefined);
    return Services.EncoderQueryService.getRecordingEncoderChoices(mode, formats);
  }, [mode, format]);
  const savedEncoder = savedRecording?.parameters.find(p => p.name === 'RecEncoder');
  const quality = savedRecording?.parameters.find(p => p.name === 'RecQuality')?.value;
  const diagnosticId =
    format?.enabled && savedEncoder?.visible && quality !== 'Stream' && quality !== 'Lossless'
      ? String(savedEncoder.value ?? '')
      : '';
  const missingEncoder = useMemo(
    () =>
      diagnosticId
        ? Services.EncoderQueryService.getMissingEncoderInfo(mode, diagnosticId, 'recording')
        : null,
    [mode, diagnosticId],
  );

  const base = JSON.stringify([
    mode,
    format?.enabled,
    ...saved.flatMap(s =>
      s.parameters.filter(p => encoderField(s.nameSubCategory, p.name)).map(p => p.value),
    ),
  ]);
  const [pending, setPending] = useState<{ base: string; edits: IOutputEdit[] }>();
  useEffect(() => {
    setPending(undefined);
  }, [base]);
  const edits = pending?.base === base ? pending.edits : [];

  function selection(data: ISettingsSubCategory[]) {
    const group = data.find(s => s.nameSubCategory === 'Recording');
    const stream = data
      .find(s => s.nameSubCategory === 'Streaming')
      ?.parameters.find(p => p.name === (mode === 'Simple' ? 'StreamEncoder' : 'Encoder'));
    return recordingEncoderSelection(
      group?.parameters ?? [],
      mode,
      String(stream?.value ?? ''),
      choices,
      missingEncoder,
    );
  }

  const displayed = applyEdits(saved, edits);
  const recording = displayed.find(s => s.nameSubCategory === 'Recording');
  if (recording) recording.parameters = selection(displayed).parameters;
  if (mode === 'Advanced' && edits.some(edit => edit.section === 'Streaming')) {
    const stream = displayed.find(s => s.nameSubCategory === 'Streaming');
    const encoder = stream?.parameters.find(p => p.name === 'Encoder') as IObsListInput<string>;
    if (encoder) {
      encoder.warning = $t(
        'Choose a compatible format or encoder in the Recording tab to save this change.',
      );
    }
  }
  const sections = displayed.filter(s => s.parameters.some(p => p.visible));

  function onChange(formData: TObsFormData, ind: number, fieldIndex: number) {
    const field = formData[fieldIndex];
    const edit = { section: sections[ind].nameSubCategory, name: field.name, value: field.value };
    const sharesEncoder = recording?.parameters.some(
      p =>
        (p.name === 'RecQuality' && p.value === 'Stream') ||
        (p.name === 'RecEncoder' && p.value === 'none'),
    );
    if (
      !encoderField(edit.section, edit.name) ||
      (edit.section === 'Streaming' && !sharesEncoder)
    ) {
      saveSettings(applyEdits(saved, [edit]));
      return;
    }

    const nextEdits = [
      ...edits.filter(e => e.name !== edit.name || e.section !== edit.section),
      edit,
    ];
    const next = applyEdits(saved, nextEdits);
    if (!selection(next).valid) {
      setPending({ base, edits: nextEdits });
      return;
    }
    setPending(undefined);
    saveSettings(next);
  }

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
                onChange={(formData, field) => p.onChange(formData, ind, field)}
              />
              <Tabs tabs={tabs} onChange={setCurrentTab} style={{ marginBottom: '24px' }} />
            </>
          )}

          {sectionProps.nameSubCategory === currentTab && (
            <ObsForm
              name={sectionProps.nameSubCategory}
              value={sectionProps.parameters}
              onChange={(formData, field) => p.onChange(formData, ind, field)}
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
                onChange={(formData, field) => p.onChange(formData, ind, field)}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
