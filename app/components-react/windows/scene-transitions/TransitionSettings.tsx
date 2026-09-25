import React, { useEffect, useState } from 'react';
import { Services } from 'components-react/service-provider';
import { metadata } from 'components-react/shared/inputs/metadata';
import { $t } from 'services/i18n';
import { useVuex } from 'components-react/hooks';
import { useSubscription } from 'components-react/hooks/useSubscription';
import FormFactory, { TInputValue } from 'components-react/shared/inputs/FormFactory';
import { ObsForm } from 'components-react/obs/ObsForm';
import { TObsFormData } from 'components/obs/inputs/ObsInput';
import Scrollable from 'components-react/shared/Scrollable';

export default function TransitionSettings(p: { transitionId: string }) {
  const { TransitionsService, EditorCommandsService } = Services;

  const { values, typeOptions } = useVuex(() => ({
    values: TransitionsService.views.getPropertiesForTransition(p.transitionId),
    typeOptions: TransitionsService.views.getTypes(),
  }));

  const meta = {
    name: metadata.text({ label: $t('Name') }),
    type: metadata.list({
      label: $t('Type'),
      options: typeOptions,
      children: {
        duration: metadata.number({
          label: $t('Duration'),
          displayed: values.type !== 'obs_stinger_transition' && values.type !== 'cut_transition',
        }),
      },
    }),
  };

  const [formData, setFormData] = useState(() =>
    TransitionsService.getPropertiesFormData(p.transitionId),
  );

  // Note: the OBS form is predicated on the value type which this function reads internally
  // but can become stale in react without the type being attached to the dependency graph
  useEffect(() => {
    setFormData(TransitionsService.getPropertiesFormData(p.transitionId));
  }, [p.transitionId, values.type]);

  // re-read the form once the service has written the change to OBS
  useSubscription(TransitionsService.transitionPropertiesChanged, id => {
    if (id !== p.transitionId) return;
    setFormData(TransitionsService.getPropertiesFormData(p.transitionId));
  });

  function handleObsChange(patch: TObsFormData) {
    setFormData(patch);
    TransitionsService.actions.setPropertiesFormData(p.transitionId, patch);
  }

  function handleChange(key: string) {
    return (val: TInputValue) => {
      EditorCommandsService.actions.executeCommand('EditTransitionCommand', p.transitionId, {
        [key]: val,
      });
    };
  }

  return (
    <Scrollable style={{ height: '100%' }} snapToWindowEdge>
      <FormFactory metadata={meta} values={values} onChange={handleChange} />
      <ObsForm value={formData} onChange={handleObsChange} layout="horizontal" />
    </Scrollable>
  );
}
