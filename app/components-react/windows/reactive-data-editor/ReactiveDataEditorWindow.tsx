import React, { useState } from 'react';
import { ModalLayout } from 'components-react/shared/ModalLayout';
import { Services } from 'components-react/service-provider';
import type { ReactiveDataEditorProps } from './types';
import { useChildWindowParams } from 'components-react/hooks';
import ReactiveDataEditor from './ReactiveDataEditor';
import { schemaFlat } from './lib/schema';

export default function ReactiveDataEditorWindow() {
  const { WindowsService, UserStateService } = Services;

  const props: ReactiveDataEditorProps = useChildWindowParams();

  function handleCancel() {
    WindowsService.actions.closeChildWindow();
  }

  const [stateFlat, setStateFlat] = useState(UserStateService.state.stateFlat);

  const handleSaveChanges = (changes: Partial<Record<string, number>>) => {
    console.log('Saving changes:', changes);
    setStateFlat(prev => ({ ...prev, ...changes }));

    UserStateService.actions.updateState(changes);
  };

  type FlatSchemaKey = keyof typeof schemaFlat;
  const filteredStateKeys = props.stateKeysOfInterest as FlatSchemaKey[];

  return (
    <ModalLayout bodyStyle={{ padding: '0px' }} hideFooter={true}>
      <ReactiveDataEditor
        schema={schemaFlat}
        state={stateFlat as Partial<Record<string, number>>}
        onSave={handleSaveChanges}
        onCancel={handleCancel}
        filteredStateKeys={filteredStateKeys}
      />
    </ModalLayout>
  );
}
