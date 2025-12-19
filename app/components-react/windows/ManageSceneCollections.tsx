import React, { useEffect, useState } from 'react';
import { Layout, Tooltip } from 'antd';
import Fuse from 'fuse.js';
import moment from 'moment';
import cx from 'classnames';
import { ModalLayout } from 'components-react/shared/ModalLayout';
import { Services } from 'components-react/service-provider';
import { confirmAsync, promptAsync, alertAsync } from 'components-react/modals';
import Scrollable from 'components-react/shared/Scrollable';
import { $t } from 'services/i18n';
import { $i } from 'services/utils';
import { ISceneCollectionsManifestEntry } from 'services/scene-collections';
import { getOS, OS } from 'util/operating-systems';
import styles from './ManageSceneCollections.m.less';
import { TextInput } from 'components-react/shared/inputs';
import { useVuex } from 'components-react/hooks';
import Translate from 'components-react/shared/Translate';
import UltraIcon from 'components-react/shared/UltraIcon';
import ButtonHighlighted from 'components-react/shared/ButtonHighlighted';
import * as remote from '@electron/remote';

const { Sider, Content } = Layout;

export default function ManageSceneCollections() {
  const {
    WindowsService,
    SceneCollectionsService,
    ObsImporterService,
    TwitchStudioImporterService,
    MagicLinkService,
    NavigationService,
    UsageStatisticsService,
    UserService,
  } = Services;
  const [query, setQuery] = useState('');

  const { collections, isLoggedIn, isPrime } = useVuex(() => ({
    collections: SceneCollectionsService.collections,
    isLoggedIn: UserService.views.isLoggedIn,
    isPrime: UserService.views.isPrime,
  }));

  function close() {
    SceneCollectionsService.stateService.flushManifestFile();
    WindowsService.actions.closeChildWindow();
  }

  async function create() {
    const name = await promptAsync(
      { title: $t('Enter a Scene Collection Name'), closable: true },
      SceneCollectionsService.suggestName('Scenes'),
    );
    SceneCollectionsService.actions.create({ name });
  }

  function importFromObs() {
    ObsImporterService.actions.import();
  }

  function importFromTwitch() {
    TwitchStudioImporterService.actions.import();
  }

  function filteredCollections() {
    const list = collections.sort((a, b) => (a.modified > b.modified ? -1 : 1));

    if (query) {
      const fuse = new Fuse(list, { shouldSort: true, keys: ['name'] });
      return fuse.search(query);
    }

    return list;
  }

  function goToThemes() {
    if (isLoggedIn) {
      NavigationService.actions.navigate('BrowseOverlays');
      WindowsService.actions.closeChildWindow();
    }
  }

  function upgradeToPrime() {
    UsageStatisticsService.actions.recordClick('ManageSceneCollections', 'prime');
    if (isLoggedIn) {
      MagicLinkService.linkToPrime('slobs-scene-collections');
    } else {
      remote.shell.openExternal(
        'https://streamlabs.com/ultra?checkout=1&refl=slobs-scene-collections',
      );
    }
  }

  return (
    <ModalLayout onCancel={close}>
      <Layout style={{ height: '100%' }}>
        <Sider width={300}>
          <div>{$t('Your Scene Collections:')}</div>
          <div style={{ width: '96%', marginTop: '8px', marginBottom: '8px' }}>
            <TextInput
              placeholder={$t('Search Scene Collections')}
              onChange={setQuery}
              uncontrolled={false}
              prefix={<i className="icon-search" />}
              nowrap
            />
          </div>
          <Scrollable style={{ height: 'calc(100% - 48px)' }}>
            {filteredCollections().map((collection, i) => (
              <CollectionNode collection={collection} recentlyUpdated={i < 2} key={collection.id} />
            ))}
          </Scrollable>
        </Sider>
        <Content style={{ paddingLeft: '16px' }}>
          <div>{$t('Add New Scene Collection:')}</div>
          <div className={styles.buttonContainer}>
            <button onClick={create} className={cx('button', styles.button)}>
              <i className="fa fa-solid fa-file" />
              <strong>{$t('Start Fresh')}</strong>
              <p>{$t('Start fresh and build from scratch')}</p>
            </button>
            <button
              disabled={!isLoggedIn}
              onClick={goToThemes}
              className={cx('button', styles.button)}
            >
              <i className="fa fa-solid fa-brush" />
              <strong>{$t('Overlays')}</strong>
              <p>
                {isLoggedIn
                  ? $t('Choose a template from our overlay library')
                  : $t('Log in to choose a template from our overlay library')}
              </p>
            </button>
            {!isPrime && (
              <div onClick={upgradeToPrime} className={cx('button', styles.button, styles.lg)}>
                <div className={styles.ultra}>
                  <strong>{$t('Ultra')}</strong>
                  <p>
                    <Translate message="Upgrade your stream with premium overlays with <ultra>Streamlabs Ultra</ultra>.">
                      <u slot="ultra" />
                    </Translate>
                  </p>
                  <ButtonHighlighted
                    onClick={upgradeToPrime}
                    filled
                    text={$t('Upgrade to Ultra')}
                    icon={
                      <UltraIcon
                        type="simple"
                        style={{
                          color: 'var(--black)',
                          fontSize: '12px',
                          marginRight: '5px',
                        }}
                      />
                    }
                    style={{ margin: 'auto' }}
                  />
                </div>
              </div>
            )}
            {/* If we're displaying the Ultra button, both import options are on the same row */}
            <button
              onClick={importFromObs}
              className={cx('button', styles.button, { [styles.lg]: isPrime })}
            >
              <i className="icon-cloud-backup" />
              <strong>{$t('Import from OBS')}</strong>
              <p>{$t('Load existing scenes from OBS')}</p>
            </button>
            <button
              onClick={importFromTwitch}
              className={cx('button', styles.button, { [styles.lg]: isPrime })}
            >
              <i className="icon-cloud-backup" />
              {/* Since the Ultra button takes an entire row, make text shorter here */}
              <strong>
                {isPrime ? $t('Import from Twitch Studio') : $t('Import from Twitch')}
              </strong>
              <p>{$t('Load existing scenes from Twitch Studio')}</p>
            </button>
          </div>
        </Content>
      </Layout>
    </ModalLayout>
  );
}

function CollectionNode(p: {
  collection: ISceneCollectionsManifestEntry;
  recentlyUpdated: boolean;
}) {
  const { SceneCollectionsService } = Services;
  const [duplicating, setDuplicating] = useState(false);
  const modified = moment(p.collection.modified).fromNow();
  const isActive = p.collection.id === SceneCollectionsService.activeCollection?.id;

  useEffect(onNeedsRenamedChanged, [p.collection.needsRename]);

  function onNeedsRenamedChanged() {
    if (p.collection.needsRename) rename();
  }

  async function makeActive() {
    if (p.collection.operatingSystem !== getOS()) return;
    SceneCollectionsService.actions.load(p.collection.id);
  }

  function duplicate() {
    setDuplicating(true);

    setTimeout(() => {
      SceneCollectionsService.actions.return
        .duplicate(p.collection.name, p.collection.id)
        .finally(() => setDuplicating(false));
    }, 500);
  }

  async function rename() {
    const newName = await promptAsync(
      { title: $t('Enter a Scene Collection Name'), closable: true },
      p.collection.name,
    );
    SceneCollectionsService.actions.rename(newName, p.collection.id);
  }

  async function remove() {
    const deleteConfirmed = await confirmAsync(
      $t('Are you sure you want to remove %{collectionName}?', {
        collectionName: p.collection.name,
      }),
    );
    if (deleteConfirmed) SceneCollectionsService.actions.delete(p.collection.id);
  }

  return (
    <div
      onDoubleClick={makeActive}
      className={cx(styles.collectionNode, { [styles.active]: isActive })}
    >
      <span>
        <i
          className={cx(
            'fab',
            p.collection.operatingSystem === OS.Windows ? 'fa-windows' : 'fa-apple',
          )}
        />
        {p.collection.name}
      </span>
      {p.recentlyUpdated && <span className={styles.whisper}>Updated {modified}</span>}
      <div className={styles.editIcons}>
        <Tooltip title={$t('Rename')}>
          <i className="icon-edit" onClick={rename} />
        </Tooltip>
        {!duplicating && (
          <Tooltip title={$t('Duplicate')}>
            <i className="icon-copy" onClick={duplicate} />
          </Tooltip>
        )}
        {duplicating && <i className="fa fa-spinner fa-pulse" />}
        <Tooltip title={$t('Delete')}>
          <i className="icon-trash" onClick={remove} />
        </Tooltip>
      </div>
    </div>
  );
}
