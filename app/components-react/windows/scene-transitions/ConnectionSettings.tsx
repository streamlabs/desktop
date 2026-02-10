import React from 'react';
import { metadata } from 'components-react/shared/inputs/metadata';
import FormFactory from 'components-react/shared/inputs/FormFactory';
import { useVuex } from 'components-react/hooks';
import { Services } from 'components-react/service-provider';
import { $t } from 'services/i18n';

export default function ConnectionSettings(p: { connectionId: string }) {
  const { ScenesService, TransitionsService, EditorCommandsService } = Services;

  const { sceneOptions, transitionOptions, connection } = useVuex(() => ({
    sceneOptions: [
          { label: $t('All'), value: 'ALL' },
          ...ScenesService.views.scenes.map(scene => ({
            label: scene.name,
            value: scene.id,
          })),
        ],
    transitionOptions: TransitionsService.state.transitions.map(transition => ({
      label: transition.name,
      value: transition.id,
    })),
    connection: TransitionsService.state.connections.find(
      conn => conn.id === p.connectionId,
    )
  }));

  const meta = {
    from: metadata.list({ label: $t('Beginning Scene'), options: sceneOptions }),
    transition: metadata.list({ label: $t('Scene Transition'), options: transitionOptions }),
    to: metadata.list({ label: $t('Ending Scene'), options: sceneOptions }),
  };

  const values = {
    from: connection?.fromSceneId || '',
    transition: connection?.transitionId || '',
    to: connection?.toSceneId || '',
  }

  function handleChange(key: string) {
    return (val: string) => EditorCommandsService.executeCommand('EditConnectionCommand', p.connectionId, {
      [key]: val,
    });
  }

  return <FormFactory metadata={meta} values={values} onChange={handleChange} />
}
