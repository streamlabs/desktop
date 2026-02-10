import React, { useMemo, useState } from 'react';
import cx from 'classnames';
import { Button, Menu, Modal, Table } from 'antd';
import * as remote from '@electron/remote';
import { useVuex } from 'components-react/hooks';
import { Services } from 'components-react/service-provider';
import { ETransitionType, ITransition, ITransitionConnection } from 'services/transitions';
import { $t } from 'services/i18n';
import { ModalLayout } from 'components-react/shared/ModalLayout';
import Scrollable from 'components-react/shared/Scrollable';
import ConnectionSettings from './ConnectionSettings';
import TransitionSettings from './TransitionSettings';
import styles from './SceneTransitions.m.less';
import { ColumnsType } from 'antd/lib/table';
import Tooltip from 'components-react/shared/Tooltip';
import TransitionsTable from './TransitionsTable';
import ConnectionsTable from './ConnectionsTable';

export default function SceneTransitions() {
  const { ScenesService, TransitionsService, EditorCommandsService } = Services;

  const [activeTab, setActiveTab] = useState('transitions');
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [showTransitionModal, setShowTransitionModal] = useState(false);
  const [inspectedTransition, setInspectedTransition] = useState('');
  const [inspectedConnection, setInspectedConnection] = useState('');

  const { transitionsEnabled } = useVuex(() => ({
    transitionsEnabled: ScenesService.views.scenes.length > 1,
  }));

  function dismissModal() {
    setShowConnectionModal(false);
    setShowTransitionModal(false);
  }

  return (
    <ModalLayout id="scene-transitions" wrapperStyle={{ position: 'relative' }}>
      {!transitionsEnabled && (
        <div className={styles.transitionBlank}>
          {$t('You need at least 2 scenes to edit transitions.')}
        </div>
      )}
      {transitionsEnabled && (
        <>
          <Menu mode="horizontal" selectedKeys={[activeTab]} onClick={(e) => setActiveTab(e.key)}>
            <Menu.Item key="transitions">{$t('Transitions')}</Menu.Item>
            <Menu.Item key="connections">{$t('Connections')}</Menu.Item>
          </Menu>
          <Scrollable style={{ height: 'calc(100% - 46px)' }} snapToWindowEdge>
            {activeTab === 'transitions' && (
              <TransitionsTable setInspectedTransition={setInspectedTransition} setShowTransitionModal={setShowTransitionModal} />
            )}
            {activeTab === 'connections' && (
              <ConnectionsTable setInspectedConnection={setInspectedConnection} setShowConnectionModal={setShowConnectionModal} />
            )}
          </Scrollable>
          <Modal
            visible={showConnectionModal || showTransitionModal}
            getContainer="#scene-transitions"
            bodyStyle={{ padding: 32, height: '100%' }}
            onCancel={dismissModal}
          >
            {showConnectionModal && <ConnectionSettings connectionId={inspectedConnection} />}
            {showTransitionModal && <TransitionSettings transitionId={inspectedTransition} />}
          </Modal>
        </>
      )}
    </ModalLayout>
  );
}
