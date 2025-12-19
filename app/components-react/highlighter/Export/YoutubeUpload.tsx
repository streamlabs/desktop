import React, { useState, useEffect } from 'react';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import { TextInput, TextAreaInput } from 'components-react/shared/inputs';
import Form from 'components-react/shared/inputs/Form';
import { Button, Progress, Tooltip, Alert, Dropdown } from 'antd';
import { RadioInput } from 'components-react/shared/inputs/RadioInput';
import { TPrivacyStatus } from 'services/platforms/youtube/uploader';
import electron from 'electron';
import { $t } from 'services/i18n';
import * as remote from '@electron/remote';
import VideoPreview from './VideoPreview';
import UploadProgress from './UploadProgress';
import styles from './ExportModal.m.less';
import { EUploadPlatform } from 'services/highlighter/models/highlighter.models';

export default function YoutubeUpload(props: {
  defaultTitle: string;
  close: () => void;
  streamId: string | undefined;
}) {
  const [title, setTitle] = useState(props.defaultTitle);
  const streamId = props.streamId;
  const [description, setDescription] = useState('');
  const [privacy, setPrivacy] = useState('private');
  const [isOpen, setIsOpen] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const { UserService, HighlighterService, NavigationService, UsageStatisticsService } = Services;
  const v = useVuex(() => ({
    youtubeLinked: !!UserService.state.auth?.platforms.youtube,
    youTubeUploadInfo: HighlighterService.getUploadInfo(
      HighlighterService.views.uploadInfo,
      EUploadPlatform.YOUTUBE,
    ),
    exportInfo: HighlighterService.views.exportInfo,
    otherUploadInProgress: HighlighterService.views.uploadInfo
      .filter(info => info.platform !== EUploadPlatform.YOUTUBE)
      .some(info => info.uploading),
  }));

  // Clear all errors when this component unmounts
  useEffect(() => {
    return () => HighlighterService.actions.dismissError();
  }, []);

  const options = [
    {
      label: $t('Private'),
      value: 'private',
      description: $t('Only you and people you choose can watch your video'),
    },
    {
      label: $t('Unlisted'),
      value: 'unlisted',
      description: $t('Anyone with the video link can watch your video'),
    },
    {
      label: $t('Public'),
      value: 'public',
      description: $t('Everyone can watch your video'),
    },
  ];

  function getYoutubeForm() {
    return (
      <div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
          }}
        >
          {v.youtubeLinked && (
            <div style={{ flexGrow: 1 }}>
              <Form layout="vertical">
                <TextInput label={$t('Title')} value={title} onChange={setTitle} />
                <TextAreaInput
                  label={$t('Description')}
                  value={description}
                  onChange={setDescription}
                />

                <div style={{ marginBottom: '8px' }}> {$t('Privacy Status')}</div>
                <Dropdown
                  overlay={
                    <div className={styles.innerItemWrapper}>
                      {options.map(option => {
                        return (
                          <div
                            className={`${styles.innerDropdownItem} ${
                              option.value === privacy ? styles.active : ''
                            }`}
                            onClick={() => {
                              setPrivacy(option.value);
                              setIsOpen(false);
                            }}
                            key={option.label}
                          >
                            <div className={styles.dropdownText}>
                              {option.label} <p>{option.description}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  }
                  trigger={['click']}
                  visible={isOpen}
                  onVisibleChange={setIsOpen}
                  placement="bottomLeft"
                >
                  <div className={styles.innerDropdownWrapper} onClick={() => setIsOpen(!isOpen)}>
                    <div className={styles.dropdownText}>
                      {options.find(option => option.value === privacy)?.label}
                    </div>
                    <i className="icon-down"></i>
                  </div>
                </Dropdown>
              </Form>
            </div>
          )}
          {!v.youtubeLinked && (
            <div style={{ flexGrow: 1 }}>
              <div>
                {$t('Please connect your YouTube account to upload your video to YouTube.')}
              </div>
              <button
                style={{ marginTop: 8 }}
                className="button button--youtube"
                onClick={() =>
                  NavigationService.actions.navigate('PlatformMerge', {
                    platform: 'youtube',
                    highlighter: true,
                  })
                }
              >
                {$t('Connect')}
              </button>
            </div>
          )}
        </div>
        {v.youTubeUploadInfo?.error && (
          <Alert
            style={{ marginBottom: 8, marginTop: 8 }}
            message={$t('An error occurred while uploading to YouTube')}
            type="error"
            closable
            showIcon
            afterClose={() => HighlighterService.actions.dismissError()}
          />
        )}
        {v.youtubeLinked && (
          <Button
            type="primary"
            size="large"
            style={{
              width: '100%',
              marginTop: '16px',
              pointerEvents: v.otherUploadInProgress ? 'none' : 'auto',
              opacity: v.otherUploadInProgress ? '0.6' : '1',
            }}
            onClick={() => {
              UsageStatisticsService.actions.recordFeatureUsage('HighlighterUpload');
              HighlighterService.actions.uploadYoutube(
                {
                  title,
                  description,
                  privacyStatus: privacy as TPrivacyStatus,
                },
                streamId,
              );
            }}
          >
            {$t('Publish')}
          </Button>
        )}
      </div>
    );
  }

  function getUploadDone() {
    const url = `https://youtube.com/watch?v=${v.youTubeUploadInfo?.videoId}`;

    return (
      <div>
        <p>
          {$t(
            'Your video was successfully uploaded! Click the link below to access your video. Please note that YouTube will take some time to process your video.',
          )}
        </p>
        <br />
        <a onClick={() => remote.shell.openExternal(url)}>{url}</a>
        <Tooltip placement="right" title={urlCopied ? 'Copied!' : 'Copy URL'}>
          <i
            className="icon-copy link"
            style={{ marginLeft: 8, display: 'inline', cursor: 'pointer' }}
            onClick={() => {
              setUrlCopied(true);
              electron.clipboard.writeText(url);
            }}
          />
        </Tooltip>
      </div>
    );
  }

  return (
    <div>
      {!v.youTubeUploadInfo?.uploading && !v.youTubeUploadInfo?.videoId && getYoutubeForm()}
      {v.youtubeLinked && v.youTubeUploadInfo?.uploading && (
        <UploadProgress platform={EUploadPlatform.YOUTUBE} />
      )}
      {v.youtubeLinked && v.youTubeUploadInfo?.videoId && getUploadDone()}
    </div>
  );
}
