import React, { useEffect, useState, useRef } from 'react';
import { clipboard } from 'electron';
import * as remote from '@electron/remote';
import { Layout, message, Card, Menu, Progress, PageHeader } from 'antd';
import cx from 'classnames';
import { IMediaGalleryFile, IMediaGalleryInfo } from 'services/media-gallery';
import { $t } from 'services/i18n';
import { ModalLayout } from 'components-react/shared/ModalLayout';
import Scrollable from 'components-react/shared/Scrollable';
import UltraIcon from 'components-react/shared/UltraIcon';
import { Services } from 'components-react/service-provider';
import { useSubscription } from 'components-react/hooks/useSubscription';
import { useChildWindowParams, useVuex } from 'components-react/hooks';
import { confirmAsync } from 'components-react/modals';
import styles from './MediaGallery.m.less';

const getTypeMap = (): Dictionary<Dictionary<string>> => ({
  title: {
    image: $t('Images'),
    audio: $t('Sounds'),
  },
  noFilesCopy: {
    image: $t("You don't have any uploaded images!"),
    audio: $t("You don't have any uploaded sounds!"),
  },
  noFilesBtn: {
    image: $t('Upload An Image'),
    audio: $t('Upload A Sound'),
  },
});

function formatBytes(bytes: number, argPlaces: number = 1) {
  if (!bytes) {
    return '0KB';
  }
  const divisor = Math.pow(10, argPlaces);
  const base = Math.log(bytes) / Math.log(1024);
  const suffix = ['', 'KB', 'MB', 'GB', 'TB'][Math.floor(base)];
  return Math.round(Math.pow(1024, base - Math.floor(base)) * divisor) / divisor + suffix;
}

export default function MediaGallery() {
  const {
    WindowsService,
    MediaGalleryService,
    UserService,
    MagicLinkService,
    WebsocketService,
  } = Services;

  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<IMediaGalleryFile | null>(null);
  const [category, setCategory] = useState<'stock' | 'uploads'>('uploads');
  const [galleryInfo, setGalleryInfo] = useState<IMediaGalleryInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const audio = useRef(new Audio());

  const typeMap = getTypeMap();
  const promiseId = useChildWindowParams('promiseId');
  const filter = useChildWindowParams('filter');

  useEffect(() => {
    fetchGalleryInfo();

    return audio.current.pause;
  }, []);

  useSubscription(WebsocketService.socketEvent, ev => {
    if (ev.type !== 'streamlabs_prime_subscribe') return;
    fetchGalleryInfo();
  });

  const { isPrime } = useVuex(() => ({
    isPrime: UserService.views.isPrime,
  }));

  async function fetchGalleryInfo() {
    setGalleryInfo(await MediaGalleryService.actions.return.fetchGalleryInfo());
  }

  async function openFilePicker() {
    const choices = await remote.dialog.showOpenDialog(remote.getCurrentWindow(), {
      properties: ['openFile', 'multiSelections'],
    });
    if (choices && choices.filePaths) {
      upload(choices.filePaths);
    }
  }

  async function upload(filepaths: string[]) {
    if (!filepaths || !filepaths.length) return;
    setBusy(true);
    message.loading({ content: $t('Uploading...'), duration: 0, key: 'uploadingMsg' });
    try {
      setGalleryInfo(await MediaGalleryService.actions.return.upload(filepaths));
    } catch (e: unknown) {
      message.error($t('This file could not be uploaded'), 2);
    } finally {
      message.destroy('uploadingMsg');
      setBusy(false);
    }
  }

  function upgradeToPrime() {
    MagicLinkService.linkToPrime('slobs-media-gallery');
    message.warning($t('You must have Streamlabs Ultra to use this media'), 5);
  }

  const filteredGallery = galleryInfo?.files.filter(file => {
    if (category !== 'stock' && file.isStock !== false) return false;
    if (category === 'stock' && file.isStock === false) return false;
    return !(filter && file.type !== filter);
  });

  const title = filter && typeMap.title[filter];
  const noFilesCopy =
    (filter && typeMap.noFilesCopy[filter]) || $t("You don't have any uploaded files!");
  const noFilesBtn = (filter && typeMap.noFilesBtn[filter]) || $t('Upload A File');
  const totalUsage = galleryInfo?.totalUsage ?? 0;
  const maxUsage = galleryInfo?.maxUsage ?? 0;
  const usagePct = galleryInfo ? totalUsage / maxUsage : 0;

  function displaySpaceRemaining() {
    return `${formatBytes(totalUsage, 2)}/${formatBytes(maxUsage, 2)}`;
  }

  function onDragEnter(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }
  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    if (!e.dataTransfer?.files) return;
    const mappedFiles = Array.from(e.dataTransfer.files).map(file => file.path);
    upload(mappedFiles);
    setDragOver(false);
  }

  function handleCategory(e: { key: string }) {
    if (e.key !== category) setCategory(e.key as 'stock' | 'uploads');
  }

  function selectFile(file: IMediaGalleryFile, shouldSelect: boolean = false, e: React.MouseEvent) {
    e.preventDefault();
    if (filter && file.type !== filter) {
      message.error($t('Not a supported file type'), 1);
    }
    setSelectedFile(file);
    if (file.type === 'audio' && !shouldSelect) {
      audio.current.pause();
      audio.current.setAttribute('src', file.href);
      audio.current.play();
    }
    if (shouldSelect) handleSelect();
  }

  function handleSelect() {
    if (!selectedFile) return WindowsService.actions.closeChildWindow();
    if (selectedFile.prime && !isPrime) {
      upgradeToPrime();
      return;
    }
    MediaGalleryService.actions.resolveFileSelect(promiseId, selectedFile);
    WindowsService.actions.closeChildWindow();
  }

  async function handleDelete() {
    if (selectedFile) {
      confirmAsync(
        $t('Are you sure you want to delete this file? This action is irreversable.'),
      ).then(async response => {
        if (!response || !selectedFile) return;
        setGalleryInfo(await MediaGalleryService.actions.return.deleteFile(selectedFile));
        setSelectedFile(null);
      });
    }
  }

  async function handleCopy(href: string) {
    try {
      await clipboard.writeText(href);
      message.success($t('URL Copied'), 1);
    } catch (e: unknown) {
      message.error($t('Failed to copy URL'), 1);
    }
  }

  return (
    <ModalLayout onOk={handleSelect}>
      <Layout className={styles.container} onDragEnter={onDragEnter} onDragOver={onDragEnter}>
        <Layout.Sider>
          <div className={styles.dropzone} onClick={openFilePicker}>
            <i className="icon-cloud-backup" />
            {$t('Drag & Drop Upload')}
          </div>
          <Menu mode="inline" onClick={handleCategory} defaultSelectedKeys={['uploads']}>
            {['uploads', 'stock'].map((cat: 'uploads' | 'stock') => (
              <Menu.Item key={cat}>
                {cat === 'stock' ? $t('Stock Files') : $t('My Uploads')}
              </Menu.Item>
            ))}
          </Menu>
        </Layout.Sider>
        <Layout.Content>
          <PageHeader
            title={title}
            subTitle={
              <Progress
                percent={Math.round(usagePct * 100)}
                style={{ width: '200px', display: 'flex', alignItems: 'center' }}
                trailColor={'var(--section-alt)'}
                format={displaySpaceRemaining}
              />
            }
            extra={[
              <i
                className={cx(styles.toolbarIcon, 'icon-cloud-backup')}
                onClick={openFilePicker}
                key="backup"
              />,
              <i
                className={cx(styles.toolbarIcon, 'icon-trash', {
                  [styles.disabled]: !selectedFile || (selectedFile && selectedFile.isStock),
                })}
                onClick={handleDelete}
                key="trash"
              />,
            ]}
          />
          <Scrollable style={{ height: 'calc(100% - 18px)' }}>
            {filteredGallery &&
              filteredGallery.map(file => (
                <Card
                  key={file.href}
                  hoverable
                  onClick={e => selectFile(file, false, e)}
                  onDoubleClick={e => selectFile(file, true, e)}
                  cover={<CardContent file={file} />}
                  style={{
                    borderColor: selectedFile?.href === file.href ? 'var(--teal)' : undefined,
                  }}
                  bodyStyle={{ fontSize: 10, padding: '8px' }}
                  headStyle={{ position: 'absolute', padding: 0, border: 'none', right: '8px' }}
                  extra={[
                    file.prime ? (
                      <UltraIcon
                        key="prime"
                        style={{
                          display: 'inline-block',
                          height: '12px',
                          width: '12px',
                          marginRight: '5px',
                        }}
                      />
                    ) : (
                      <i className="icon-copy" onClick={() => handleCopy(file.href)} key="copy" />
                    ),
                  ]}
                >
                  <Card.Meta
                    title={file.filename}
                    description={file.size && formatBytes(file.size)}
                  />
                </Card>
              ))}
          </Scrollable>

          {!filteredGallery && (
            <div className={styles.emptyBox}>
              <span>{noFilesCopy}</span>
              <button onClick={openFilePicker} className="button">
                {noFilesBtn}
              </button>
              <button onClick={() => setCategory('stock')} className="button">
                {$t('Browse the Gallery')}
              </button>
            </div>
          )}
        </Layout.Content>
      </Layout>
      {dragOver && (
        <div
          onDragOver={onDragEnter}
          onDragLeave={onDragLeave}
          onDrop={handleFileDrop}
          className={cx(styles.dragOverlay, 'radius')}
        />
      )}
      {busy && <div className={styles.busyOverlay} />}
    </ModalLayout>
  );
}

function CardContent(p: { file: IMediaGalleryFile }) {
  const { type, href } = p.file;
  let FilePreview = () => <div />;
  if (type === 'image' && (/\.webm$/.test(href) || /\.mp4$/.test(href))) {
    FilePreview = () => (
      <video autoPlay muted loop src={href} style={{ maxHeight: '148px', maxWidth: '148px' }} />
    );
  } else if (type === 'image') {
    FilePreview = () => <img src={href} style={{ maxHeight: '148px', maxWidth: '148px' }} />;
  } else if (type === 'audio') {
    FilePreview = () => (
      <i
        className="icon-music"
        style={{
          height: '132px',
          lineHeight: '132px',
          fontSize: '28px',
          textAlign: 'center',
          display: 'block',
        }}
      />
    );
  }
  return (
    <div
      style={{
        height: '150px',
        width: '150px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <FilePreview />
    </div>
  );
}
