import React, { useMemo, useState } from 'react';
import { shell } from '@electron/remote';
import { Services } from '../service-provider';
import { IObsFormProps, ObsForm } from '../obs/ObsForm';
import { TObsFormData } from '../../components/obs/inputs/ObsInput';
import { ModalLayout } from '../shared/ModalLayout';
import Display from '../shared/Display';
import { assertIsDefined } from '../../util/properties-type-guards';
import { useSubscription } from '../hooks/useSubscription';
import { $t } from 'services/i18n';

const SUPPORTED_WEBCAMS: Set<string> = new Set([
  '0x046d-0x0943',
  '0x046d-0x0946',
  '0x046d-0x0919',
  '0x046d-0x0944',
  '0x046d-0x091d',
  '0x046d-0x085e',
  '0x046d-0x086b',
  '0x046d-0x082d',
  '0x046d-0x0892',
  '0x046d-0x08e5',
  '0x046d-0x085c',
  '0x046d-0x0883',
  '0x046d-0x0894',
  '0x046d-0x091b',
  '0x046d-0x091c',
]);

// Returns the vid and pid from a logitech device id
export function parseId(id?: string) {
  if (!id) return '';
  //Id strings have a lot of elements but we want to pull the vid and pid
  const match = id.match(/vid_([\w\d]+)&pid_([\w\d]+)/);
  if (!match) return '';
  const [_, vid, pid] = [...match];
  return `0x${vid}-0x${pid}`;
}

export default function SourceProperties() {
  const {
    WindowsService,
    SourcesService,
    EditorCommandsService,
    UsageStatisticsService,
  } = Services;

  // get source
  const source = useMemo(() => {
    const { sourceId } = WindowsService.getChildWindowQueryParams();
    return SourcesService.views.getSource(sourceId);
  }, []);

  // define reactive variables
  const [properties, setProperties] = useState(() =>
    source ? source.getPropertiesFormData() : [],
  );

  // close the window if the source has been deleted
  useSubscription(SourcesService.sourceRemoved, removedSource => {
    if (source && removedSource.sourceId !== source.sourceId) return;
    WindowsService.actions.closeChildWindow();
  });

  // update properties state if the source has been changed
  useSubscription(SourcesService.sourceUpdated, updatedSource => {
    if (source && updatedSource.sourceId !== source.sourceId) return;
    setProperties(source!.getPropertiesFormData());
  });

  function onChangeHandler(formData: TObsFormData, changedInd: number) {
    assertIsDefined(source);

    if (formData[changedInd].name === 'video_config') {
      UsageStatisticsService.actions.recordFeatureUsage('DShowConfigureVideo');
    }

    // save source settings
    EditorCommandsService.executeCommand('EditSourcePropertiesCommand', source.sourceId, [
      formData[changedInd],
    ]);
  }

  const videoDevice =
    source &&
    ['dshow_input', 'macos_avcapture'].includes(source.type) &&
    source.getSettings().video_device_id;
  const isSupportedWebcam = SUPPORTED_WEBCAMS.has(parseId(videoDevice));

  function configureInGHub() {
    shell.openExternal(`lghubapp://devices/${parseId(videoDevice)}/default`);
  }

  // make the URL field debounced for the browser_source
  const extraProps: IObsFormProps['extraProps'] = {};
  if (source && source.type === 'browser_source') {
    extraProps['url'] = { debounce: 1000 };
  }

  return (
    <ModalLayout
      scrollable
      fixedChild={source && <Display sourceId={source.sourceId} style={{ position: 'relative' }} />}
    >
      <ObsForm
        value={properties}
        onChange={onChangeHandler}
        extraProps={extraProps}
        layout="horizontal"
      />
      {isSupportedWebcam && (
        <a onClick={configureInGHub} style={{ marginLeft: 184 }}>
          {$t('Configure on G HUB')}
        </a>
      )}
    </ModalLayout>
  );
}
