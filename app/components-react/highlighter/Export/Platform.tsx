import { Form, Dropdown, Button, Collapse, CollapseProps } from 'antd';
import { useVuex } from 'components-react/hooks';
import { useController } from 'components-react/hooks/zustand';
import { ListInput } from 'components-react/shared/inputs';
import React, { useEffect, useState } from 'react';
import { TOrientation, EOrientation } from 'services/highlighter/models/ai-highlighter.models';
import { $t } from 'services/i18n';
import { ExportModalCtx } from './ExportModal';
import StorageUpload from './StorageUpload';
import YoutubeUpload from './YoutubeUpload';
import { Services } from 'components-react/service-provider';
import styles from './ExportModal.m.less';
import VideoPreview from './VideoPreview';
import { formatSecondsToHMS } from '../ClipPreview';
import { $i } from 'services/utils';
import * as remote from '@electron/remote';
import { EUploadPlatform } from 'services/highlighter/models/highlighter.models';

export default function PlatformSelect({
  onClose,
  videoName,
  streamId,
}: {
  onClose: () => void;
  videoName: string;
  streamId: string | undefined;
}) {
  const { store, exportInfo, clearUpload, getStreamTitle, getClips, getDuration } = useController(
    ExportModalCtx,
  );
  const { UserService, HighlighterService } = Services;
  const { isYoutubeLinked } = useVuex(() => ({
    isYoutubeLinked: !!UserService.state.auth?.platforms.youtube,
  }));
  const [platform, setPlatform] = useState(() => (isYoutubeLinked ? 'youtube' : 'crossclip'));
  const clipsAmount = getClips(streamId).length;
  const clipsDuration = formatSecondsToHMS(getDuration(streamId));
  async function handlePlatformSelect(val: string) {
    if (platform === 'youtube') await clearUpload();
    setPlatform(val);
  }

  useEffect(() => {
    HighlighterService.clearUpload();
    return () => {
      HighlighterService.clearUpload();
    };
  }, []);

  const items = [
    {
      key: '1',
      label: 'Youtube',
      children: <YoutubeUpload defaultTitle={videoName} close={onClose} streamId={streamId} />,
    },
  ];

  function openInFolder() {
    remote.shell.showItemInFolder(exportInfo.file);
  }

  return (
    <div className={styles.modalWrapper}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h2 style={{ fontWeight: 600, margin: 0 }}>{$t('Publish to')}</h2>{' '}
        <div>
          <Button type="text" onClick={onClose}>
            <i className="icon-close" style={{ margin: 0 }}></i>
          </Button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '16px', cursor: 'pointer' }} onClick={openInFolder}>
        <h2 className={styles.customInput} style={{ width: 'fit-content', whiteSpace: 'nowrap' }}>
          {videoName}
        </h2>
        <p style={{ width: 'fit-content', whiteSpace: 'nowrap' }}>
          {clipsDuration} | {clipsAmount} clips
        </p>
      </div>
      <div className={styles.publishWrapper}>
        <div className={styles.videoWrapper}>
          <VideoPreview />
        </div>
        <div
          style={{
            width: '100%',
            height: '100%',
            overflowY: 'scroll',
            paddingRight: '8px',
          }}
        >
          <Collapse
            expandIconPosition="right"
            defaultActiveKey={['1']}
            bordered={false}
            style={{ width: '424px', height: '424px' }}
          >
            {items.map((item: any) => (
              <Collapse.Panel
                key={item.key}
                header={item.label}
                style={{
                  marginBottom: '12px',
                  borderStyle: 'solid',
                  borderWidth: '1px',
                  borderColor: '#ffffff10',
                  borderRadius: '8px',
                  backgroundColor: '#232d3530',
                }}
              >
                {item.children}
              </Collapse.Panel>
            ))}
          </Collapse>
        </div>
      </div>
      <div className={styles.bottomRow}>
        <Button style={{ height: '100%', borderRadius: '8px' }} onClick={openInFolder}>
          {$t('Open file location')}
        </Button>
        <BottomRowButton
          colorRGB="255, 80, 164"
          icon="crossclip.png"
          description={$t('Manually create vertical version for social media')}
          buttonText={$t('Edit in Cross Clip')}
          platform={EUploadPlatform.CROSSCLIP}
        />
        <BottomRowButton
          colorRGB="255, 81, 81"
          icon="video-editor.png"
          description={$t('Full fletched video editing, collaboration and more')}
          buttonText={$t('Edit in Video Editor')}
          platform={EUploadPlatform.VIDEOEDITOR}
        />
        <BottomRowButton
          colorRGB="94, 229, 124"
          icon="podcast-editor.png"
          description={$t('Subtitles, transcripts, translations and more')}
          buttonText={$t('Edit in Podcast Editor')}
          platform={EUploadPlatform.TYPESTUDIO}
        />
      </div>
    </div>
  );
}

function BottomRowButton({
  colorRGB,
  icon,
  buttonText,
  description,
  platform,
}: {
  colorRGB: string;
  icon: string;
  buttonText: string;
  description: string;
  platform: EUploadPlatform;
}) {
  const { HighlighterService } = Services;

  const { currentUploadInfo, otherUploadInfo } = useVuex(() => ({
    currentUploadInfo: HighlighterService.getUploadInfo(
      HighlighterService.views.uploadInfo,
      platform,
    ),
    otherUploadInfo: HighlighterService.views.uploadInfo
      .filter(info => info.platform !== platform)
      .some(info => info.uploading),
  }));
  return (
    <div
      className={styles.bottomRowButton}
      style={
        {
          '--color-rgb': colorRGB,
          pointerEvents: otherUploadInfo ? 'none' : 'auto',
          opacity: otherUploadInfo ? '0.6' : '1',
        } as React.CSSProperties
      }
    >
      <img style={{ width: '24px', height: '24px' }} src={$i(`images/products/${icon}`)} />
      {!currentUploadInfo?.uploading && (
        <>
          <p>{description}</p>
        </>
      )}
      <StorageUpload onClose={() => {}} platform={platform} />
    </div>
  );
}
