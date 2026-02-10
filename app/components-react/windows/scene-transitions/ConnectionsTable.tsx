import React, { useMemo } from 'react';
import { Button, Table } from 'antd';
import cx from 'classnames';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import { $t } from 'services/i18n';
import { ITransitionConnection } from 'services/transitions';
import { ColumnsType } from 'antd/lib/table';
import styles from './SceneTransitions.m.less';
import Tooltip from 'components-react/shared/Tooltip';

export default function ConnectionsTable(p: { setInspectedConnection: (id: string) => void; setShowConnectionModal: (val: boolean) => void; }) {
  const { TransitionsService, EditorCommandsService, ScenesService } = Services;

  const { transitions, connections } = useVuex(() => ({
    transitions: TransitionsService.state.transitions,
    connections: TransitionsService.state.connections,
  }));

  async function addConnection() {
    const connection = EditorCommandsService.actions.return.executeCommand(
      'CreateConnectionCommand',
      ScenesService.views.scenes[0].id,
      ScenesService.views.scenes[1].id,
      transitions[0].id,
    ) as ITransitionConnection;

    if (!connection) return;
    editConnection(connection.id);
  }

  function editConnection(id: string) {
    p.setInspectedConnection(id);
    p.setShowConnectionModal(true);
  }

  function deleteConnection(id: string) {
    EditorCommandsService.actions.executeCommand('RemoveConnectionCommand', id);
  }

  function getTransitionName(id: string) {
    const transition = TransitionsService.views.getTransition(id);

    if (transition) return transition.name;
    return `<${$t('Deleted')}>`;
  }

  function getSceneName(id: string | 'ALL') {
    if (id === 'ALL') return $t('All');

    const scene = ScenesService.views.getScene(id);

    if (scene) return scene.name;
    return `<${$t('Deleted')}>`;
  }

  function isConnectionRedundant(id: string) {
    return TransitionsService.views.isConnectionRedundant(id);
  }

  const columns: ColumnsType<ITransitionConnection> = [
    {
      title: $t('Beginning Scene'),
      dataIndex: 'fromScene',
      render: (_, { fromSceneId }) => getSceneName(fromSceneId),
    },
    {
      title: $t('Transition Name'),
      dataIndex: 'transitionName',
      render: (_, { transitionId }) => getTransitionName(transitionId),
    },
    {
      title: $t('Ending Scene'),
      dataIndex: 'toScene',
      render: (_, { toSceneId }) => getSceneName(toSceneId),
    },
    {
      dataIndex: 'controls',
      render: (_, { id }) => (
        <span className={styles.tableControls}>
          {isConnectionRedundant(id) && <Tooltip title={$t(
            'This connection is redundant because another connection already connects these scenes.',
          )} placement='left'>
            <i className={cx('icon-information', styles.transitionRedundant)} />
          </Tooltip>}
          <i onClick={() => editConnection(id)} className={cx('icon-edit', styles.transitionControl)} />
          <i onClick={() => deleteConnection(id)} className={cx('icon-trash', styles.transitionControl)} />
        </span>
      ),
    }
  ];

  return (
    <>
      <Button className="button button--action" onClick={addConnection}>{$t('Add Connection')}</Button>
      <Table columns={columns} dataSource={connections} />
    </>
  );
}
