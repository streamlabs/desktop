import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Services } from 'components-react/service-provider';
import { metadata } from 'components-react/shared/inputs/metadata';
import { $t } from 'services/i18n';
import { useVuex, useIsMounted, useDebounce } from 'components-react/hooks';
import { useSubscription } from 'components-react/hooks/useSubscription';
import FormFactory, { TInputValue } from 'components-react/shared/inputs/FormFactory';
import { ObsForm } from 'components-react/obs/ObsForm';
import { TObsFormData } from 'components/obs/inputs/ObsInput';
import Scrollable from 'components-react/shared/Scrollable';
import { TRANSITION_DURATION_MAX } from 'services/transitions';

export default function TransitionSettings(p: { transitionId: string }) {
  const { TransitionsService, EditorCommandsService } = Services;
  const isMounted = useIsMounted();

  const { values, typeOptions } = useVuex(() => ({
    values: TransitionsService.views.getPropertiesForTransition(p.transitionId),
    typeOptions: TransitionsService.views.getTypes(),
  }));

  const [formData, setFormData] = useState<TObsFormData>([]);
  // OBS form edits that have not been committed to the service yet
  const pendingFormData = useRef<TObsFormData | null>(null);

  async function loadFormData() {
    const data = await TransitionsService.actions.return.getPropertiesFormData(p.transitionId);
    if (!isMounted.current || pendingFormData.current) return;
    setFormData(data);
  }

  // Dependencies left empty intentionally because `useDebounce` freezes its callback and the caller
  // remounts via `key={transitionId}`
  const commitNow = useCallback(() => {
    const data = pendingFormData.current;
    pendingFormData.current = null;
    if (!data) return;
    EditorCommandsService.actions.executeCommand('EditTransitionCommand', p.transitionId, {
      formData: data,
    });
  }, []);

  const commitDebounced = useDebounce(500, commitNow);

  useEffect(() => {
    loadFormData();
    return () => {
      commitDebounced.flush();
    };
  }, []);

  // Also fires on type changes (the OBS properties are rebuilt), undo/redo and app-driven changes
  useSubscription(TransitionsService.transitionPropertiesChanged, id => {
    if (id === p.transitionId) loadFormData();
  });

  const meta = {
    name: metadata.text({ label: $t('Name'), debounce: 500 }),
    type: metadata.list({
      label: $t('Type'),
      options: typeOptions,
      children: {
        duration: metadata.number({
          label: $t('Duration'),
          min: 0,
          max: TRANSITION_DURATION_MAX,
          debounce: 500,
          displayed: values.type !== 'obs_stinger_transition' && values.type !== 'cut_transition',
        }),
      },
    }),
  };

  function handleObsChange(patch: TObsFormData, changedIndex: number) {
    if (isMounted.current) setFormData(patch);
    pendingFormData.current = patch;

    // Number inputs emit on every keystroke, so only these are debounced
    const DEBOUNCED_OBS_TYPES = [
      'OBS_PROPERTY_INT',
      'OBS_PROPERTY_UINT',
      'OBS_PROPERTY_DOUBLE',
      'OBS_PROPERTY_FLOAT',
    ];

    if (DEBOUNCED_OBS_TYPES.includes(patch[changedIndex]?.type)) {
      commitDebounced();
      // Inputs flush their value while unmounting, after this component's own flush already ran
      if (!isMounted.current) commitDebounced.flush();
    } else {
      commitDebounced.cancel();
      commitNow();
    }
  }

  function handleChange(key: string) {
    return (val: TInputValue) => {
      let changes: Record<string, TInputValue> = { [key]: val };

      if (key === 'type') {
        // Pending OBS properties belong to the previous type
        commitDebounced.cancel();
        pendingFormData.current = null;
      }

      if (key === 'duration') {
        changes = { duration: Math.min(Math.round(Number(val)), TRANSITION_DURATION_MAX) };
      }

      EditorCommandsService.actions.executeCommand(
        'EditTransitionCommand',
        p.transitionId,
        changes,
      );
    };
  }

  return (
    <Scrollable style={{ height: '100%' }} snapToWindowEdge>
      <FormFactory metadata={meta} values={values} onChange={handleChange} />
      <ObsForm value={formData} onChange={handleObsChange} layout="horizontal" />
    </Scrollable>
  );
}
