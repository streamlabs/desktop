import React, { useMemo } from 'react';
import remote from '@electron/remote';
import { Button, Table } from 'antd';
import cx from 'classnames';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import { $t } from 'services/i18n';
import { ETransitionType, ITransition } from 'services/transitions';
import { ColumnsType } from 'antd/lib/table';
import styles from './SceneTransitions.m.less';
import Tooltip from 'components-react/shared/Tooltip';

export default function TransitionsTable(p:
  { setInspectedTransition: (id: string) => void, setShowTransitionModal: (val: boolean) => void; }
) {
  const { TransitionsService, EditorCommandsService } = Services;

  const { transitions, defaultId } = useVuex(() => ({
    transitions: TransitionsService.state.transitions,
    defaultId: TransitionsService.state.defaultTransitionId,
  }));

  //  * Scene transitions created from apps should not be editable
  //  * if the app developer specified `shouldLock` as part of their
  //  * scene transition creation options.
  const lockStates = useMemo(() => TransitionsService.getLockedStates(), []);
  function canEdit(id: string) {
    return !lockStates[id];
  };

  function getEditableMessage(id: string) {
    if (canEdit(id)) return;
    return $t('This scene transition is managed by an App and cannot be edited.');
  }

  async function addTransition() {
    const transition = await EditorCommandsService.actions.return.executeCommand(
      'CreateTransitionCommand',
      ETransitionType.Cut,
      'New Transition',
    ) as ITransition;

    if (!transition) return;
    editTransition(transition.id);
  }

  function editTransition(id: string) {
    if (!canEdit(id)) return;
    p.setInspectedTransition(id);
    p.setShowTransitionModal(true);
  }

  function deleteTransition(id: string) {
    if (transitions.length === 1) {
      remote.dialog.showMessageBox({
        title: 'Streamlabs Desktop',
        message: $t('You need at least 1 transition.'),
      });
      return;
    }

    EditorCommandsService.actions.executeCommand('RemoveTransitionCommand', id);
  }

  function makeDefault(id: string) {
    EditorCommandsService.actions.executeCommand('SetDefaultTransitionCommand', id);
  }

  function nameForType(type: ETransitionType) {
    return TransitionsService.views.getTypes().find(t => t.value === type)?.label;
  }

  const columns: ColumnsType<ITransition> = [
    {
      title: $t('Default'),
      dataIndex: 'default',
      render: (_, { id }) => (
        <div className={styles.transitionDefaultSelector}>
          <i
            onClick={() => makeDefault(id)}
            className={cx(defaultId === id ? 'fas' : 'far', 'fa-circle', defaultId === id && styles.transitionDefault)}
          />
        </div>
      ),
    },
    {
      title: $t('Name'),
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: $t('Transition Type'),
      dataIndex: 'type',
      render: (_, { type }) => nameForType(type),
    },
    {
      dataIndex: 'controls',
      render: (_, { id }) => (
        <span className={styles.tableControls}>
          <Tooltip title={getEditableMessage(id)} placement='left'>
            <i onClick={() => editTransition(id)} className={cx(styles.transitionControl, canEdit(id) ? 'icon-edit' : 'disabled icon-lock')} />
          </Tooltip>
          <i onClick={() => deleteTransition(id)} className={cx('icon-trash', styles.transitionControl)} />
        </span>
      ),
    }
  ];

  return (
    <>
      <Button className="button button--action" onClick={addTransition}>{$t('Add Transition')}</Button>
      <Table columns={columns} dataSource={transitions} rowKey={(record) => record.id} />
    </>
  );
}
