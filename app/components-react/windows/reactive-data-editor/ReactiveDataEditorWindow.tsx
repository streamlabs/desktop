import React, { useState, useMemo } from 'react';
import { ModalLayout } from 'components-react/shared/ModalLayout';
import { Services } from 'components-react/service-provider';
import { useChildWindowParams } from 'components-react/hooks';
import { useRealmObject } from 'components-react/hooks/realm';
import ReactiveDataEditor from './ReactiveDataEditor';
import { $t } from 'services/i18n';
import { IReactiveDataEditorProps } from 'components-react/windows/reactive-data-editor/types';
import { StateFlatType, SchemaFlatType } from 'services/reactive-data';

export default function ReactiveDataEditorWindow() {
  const { WindowsService, ReactiveDataService } = Services;

  const props: IReactiveDataEditorProps = useChildWindowParams();

  function handleCancel() {
    WindowsService.actions.closeChildWindow();
  }

  const reactiveDataState = useRealmObject(ReactiveDataService.state);

  const [stateFlat, setStateFlat] = useState<StateFlatType | null>(() =>
    reactiveDataState.stateFlat ? { ...reactiveDataState.stateFlat } : reactiveDataState.stateFlat,
  );

  const schemaFlat = useMemo<SchemaFlatType | null>(() => reactiveDataState.schemaFlat, [
    reactiveDataState.schemaFlatJson,
  ]);

  const handleSaveChanges = (changes: Partial<Record<string, number>>) => {
    setStateFlat(prev => (prev ? { ...prev, ...changes } : prev));

    ReactiveDataService.actions.updateState(changes);
  };

  type FlatSchemaKey = keyof typeof schemaFlat;
  const filteredStateKeys = props.stateKeysOfInterest as FlatSchemaKey[];

  // Don't render until schemaFlat and stateFlat are ready
  if (!schemaFlat || !stateFlat) {
    return (
      <ModalLayout bodyStyle={{ padding: '20px' }} hideFooter={true}>
        {!schemaFlat ? (
          <div>{$t('Waiting for schema...')}</div>
        ) : (
          <div>{$t('Waiting for state...')}</div>
        )}
      </ModalLayout>
    );
  }

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
