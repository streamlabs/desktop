import React, { useState, useEffect } from 'react';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import { TextInput, TextAreaInput } from 'components-react/shared/inputs';
import Form from 'components-react/shared/inputs/Form';
import { Button, Progress, Tooltip, Alert } from 'antd';
import { RadioInput } from 'components-react/shared/inputs/RadioInput';
import { TPrivacyStatus } from 'services/platforms/youtube/uploader';
import electron from 'electron';
import { $t } from 'services/i18n';
import * as remote from '@electron/remote';
import VideoPreview from './VideoPreview';
import UploadProgress from './UploadProgress';

export default function YoutubeUpload(props: {
  defaultTitle: string;
  close: () => void;
  streamId: string | undefined;
}) {
  const [title, setTitle] = useState(props.defaultTitle);
  const streamId = props.streamId;
  const [description, setDescription] = useState('');
  const [privacy, setPrivacy] = useState('private');
  const [urlCopied, setUrlCopied] = useState(false);
  const { UserService, HighlighterService, NavigationService, UsageStatisticsService } = Services;
  const v = useVuex(() => ({
    youtubeLinked: !!UserService.state.auth?.platforms.youtube,
    uploadInfo: HighlighterService.views.uploadInfo,
    exportInfo: HighlighterService.views.exportInfo,
  }));

  // Clear all errors when this component unmounts
  useEffect(() => {
    return () => HighlighterService.actions.dismissError();
  }, []);

  function getYoutubeForm() {
    return (
      <div>
        <div style={{ display: 'flex', flexDirection: 'row' }}>
          {v.youtubeLinked && (
            <div style={{ flexGrow: 1 }}>
              <Form layout="vertical">
                <TextInput label={$t('Title')} value={title} onChange={setTitle} />
                <TextAreaInput
                  label={$t('Description')}
                  value={description}
                  onChange={setDescription}
                />
                <RadioInput
                  label={$t('Privacy Status')}
                  options={[
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
                  ]}
                  value={privacy}
                  onChange={setPrivacy}
                />
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
          <VideoPreview />
        </div>
        {v.uploadInfo.error && (
          <Alert
            style={{ marginBottom: 24 }}
            message={$t('An error occurred while uploading to YouTube')}
            type="error"
            closable
            showIcon
            afterClose={() => HighlighterService.actions.dismissError()}
          />
        )}
        <div style={{ textAlign: 'right' }}>
          <Button style={{ marginRight: 8 }} onClick={props.close}>
            {$t('Close')}
          </Button>
          {v.youtubeLinked && (
            <Button
              type="primary"
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
      </div>
    );
  }

  function getUploadDone() {
    const url = `https://youtube.com/watch?v=${v.uploadInfo.videoId}`;

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
      {!v.uploadInfo.uploading && !v.uploadInfo.videoId && getYoutubeForm()}
      {v.youtubeLinked && v.uploadInfo.uploading && <UploadProgress />}
      {v.youtubeLinked && v.uploadInfo.videoId && getUploadDone()}
    </div>
  );
}
