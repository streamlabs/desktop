import React, { useMemo, useState } from 'react';
import { Services } from '../service-provider';
import { IObsFormProps, ObsForm } from '../obs/ObsForm';
import { TObsFormData } from '../../components/obs/inputs/ObsInput';
import { ModalLayout } from '../shared/ModalLayout';
import Display from '../shared/Display';
import { assertIsDefined } from '../../util/properties-type-guards';
import { useSubscription } from '../hooks/useSubscription';
import { useVuex } from '../hooks';
import { Alert } from 'antd';
import { $t } from 'services/i18n';
import { cameraFailureMessage, cameraFailureAdvice, cameraErrorCode } from 'services/camera-status';

export default function SourceProperties() {
  const {
    WindowsService,
    SourcesService,
    EditorCommandsService,
    UsageStatisticsService,
    CameraStatusService,
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
  const cameraError = useVuex(() => source && CameraStatusService.state.errors[source.sourceId]);

  // close the window if the source has been deleted
  useSubscription(SourcesService.sourceRemoved, removedSource => {
    if (!source || removedSource.sourceId !== source.sourceId) return;
    WindowsService.actions.closeChildWindow();
  });

  // update properties state if the source has been changed
  useSubscription(SourcesService.sourceUpdated, updatedSource => {
    if (!source || updatedSource.sourceId !== source.sourceId) return;
    setProperties(source.getPropertiesFormData());
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
      {cameraError && source && (
        <Alert
          type="warning"
          showIcon
          message={cameraFailureMessage(cameraError, source.name, $t)}
          description={
            <>
              <p>{cameraFailureAdvice(cameraError, $t)}</p>
              {cameraError.deviceName && (
                <p>{$t('Device: %{device}', { device: cameraError.deviceName })}</p>
              )}
              {!!cameraError.errorCode && (
                <details>
                  <summary>{$t('Technical details')}</summary>
                  {$t('Windows error: %{code}', { code: cameraErrorCode(cameraError) })}
                </details>
              )}
            </>
          }
          style={{ marginBottom: 16 }}
        />
      )}
      <ObsForm
        value={properties}
        onChange={onChangeHandler}
        extraProps={extraProps}
        layout="horizontal"
      />
    </ModalLayout>
  );
}
