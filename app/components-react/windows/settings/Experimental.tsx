import React from 'react';
import { Button } from 'antd';
import { ObsSettingsSection } from './ObsSettings';
import { Services } from '../../service-provider';
import { alertAsync } from '../../modals';
import { CheckCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { $t } from 'services/i18n/index';

export function ExperimentalSettings() {
  const { ScenesService, WindowsService, SceneCollectionsService } = Services;

  function repairSceneCollection() {
    ScenesService.repair();
    alertAsync('Repair finished. See details in the log file');
  }

  function showDemoComponents() {
    WindowsService.actions.showWindow({
      title: 'Shared React Components',
      componentName: 'SharedComponentsLibrary',
      size: { width: 1000, height: 1000 },
    });
  }

  /**
   * Convert a dual output scene collection to a vanilla scene collection
   * @param assignToHorizontal Boolean for if the vertical sources should be assigned to the
   * horizontal display or should be deleted
   * @param exportOverlay Boolean for is the scene collection should be exported upon completion
   */
  async function convertDualOutputCollection(assignToHorizontal: boolean = false) {
    // confirm that the active scene collection is a dual output collection
    if (
      !SceneCollectionsService?.sceneNodeMaps ||
      (SceneCollectionsService?.sceneNodeMaps &&
        Object.values(SceneCollectionsService?.sceneNodeMaps).length === 0)
    ) {
      alertAsync({
        icon: <ExclamationCircleOutlined style={{ color: 'var(--red)' }} />,
        getContainer: '#mainWrapper',
        className: 'react',
        title: $t('Invalid Scene Collection'),
        content: $t('The active scene collection is not a dual output scene collection.'),
      });
      return;
    }

    await SceneCollectionsService.actions.return
      .convertDualOutputCollection(assignToHorizontal)
      .then((message: string) => {
        const messageData = JSON.parse(message);

        const className = messageData.error ? 'react convert-error' : 'react convert-success';

        const icon = messageData.error ? (
          <ExclamationCircleOutlined style={{ color: 'var(--red)' }} />
        ) : (
          <CheckCircleOutlined style={{ color: 'var(--teal)' }} />
        );

        const title = $t(messageData?.title) ?? 'Success';

        const content = messageData?.content ?? $t('Successfully converted scene collection.');

        alertAsync({
          icon,
          getContainer: '#mainWrapper',
          className,
          title,
          content,
        });
      });
  }

  return (
    <ObsSettingsSection>
      <div className="section">
        <h2>{$t('Repair Scene Collection')}</h2>
        <Button onClick={repairSceneCollection}>Repair Scene Collection</Button>
      </div>
      <div className="section">
        <h2>{$t('Convert Dual Output Scene Collection')}</h2>

        <span>
          {$t(
            'The below will create a copy of the active scene collection, set the copy as the active collection, and then remove all vertical sources.',
          )}
        </span>
        <div style={{ marginTop: '10px' }}>
          <h4>{$t('Convert to Vanilla Scene')}</h4>
          <Button
            className="convert-collection button button--soft-warning"
            onClick={async () => await convertDualOutputCollection()}
          >
            {$t('Convert')}
          </Button>
        </div>
        {/* <div style={{ marginTop: '10px' }}>
          <h4>{$t('Assign Vertical Sources to Horizontal Display')}</h4>
          <Button
            className="assign-collection button button--soft-warning"
            onClick={async () => await convertDualOutputCollection(true)}
          >
            {$t('Assign')}
          </Button>
        </div> */}
      </div>
      <div className="section">
        <h2>{$t('Show Components Library')}</h2>
        <Button type="primary" onClick={showDemoComponents}>
          Show Shared Components Library
        </Button>
      </div>
    </ObsSettingsSection>
  );
}

ExperimentalSettings.page = 'Experimental';
