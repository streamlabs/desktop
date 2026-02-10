import React, { useMemo, useState, useEffect } from 'react';
import { Services } from 'components-react/service-provider';
import { metadata } from 'components-react/shared/inputs/metadata';
import { $t } from 'services/i18n';
import { useVuex } from 'components-react/hooks';
import FormFactory from 'components-react/shared/inputs/FormFactory';
import { ObsForm } from 'components-react/obs/ObsForm';
import isEqual from 'lodash/isEqual';
import { IObsInput, TObsValue } from 'components/obs/inputs/ObsInput';

export default function TransitionSettings(p: { transitionId: string }) {
  const { TransitionsService, EditorCommandsService } = Services;

  const { values, typeOptions } = useVuex(() => ({
    values: TransitionsService.views.getPropertiesForTransition(p.transitionId),
    typeOptions: TransitionsService.views.getTypes(),
  }));

  const meta = {
    name: metadata.text({ label: $t('Name') }),
    type: metadata.list({
      label: $t('Type'), options: typeOptions, children: {
        duration: metadata.number({ label: $t('Duration'), displayed: values.type !== 'obs_stinger_transition' && values.type !== 'cut_transition' }),
      }
    }),
  };

  function handleChange(key: string) {
    return (val: string | number) => {
      EditorCommandsService.actions.executeCommand('EditTransitionCommand', p.transitionId, {
        [key]: val,
      });
    }
  }

  return <FormFactory metadata={meta} values={values} onChange={handleChange} />;
}
