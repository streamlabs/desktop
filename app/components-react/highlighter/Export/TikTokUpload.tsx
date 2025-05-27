import React, { useState, useEffect } from 'react';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import { TextInput, TextAreaInput, SwitchInput } from 'components-react/shared/inputs';
import Form from 'components-react/shared/inputs/Form';
import { Button, Progress, Tooltip, Alert, Dropdown, Checkbox } from 'antd';
import { RadioInput } from 'components-react/shared/inputs/RadioInput';
import { TPrivacyStatus } from 'services/platforms/youtube/uploader';
import electron from 'electron';
import { $t } from 'services/i18n';
import * as remote from '@electron/remote';
import VideoPreview from './VideoPreview';
import UploadProgress from './UploadProgress';
import styles from './ExportModal.m.less';
import { EUploadPlatform } from 'services/highlighter/models/highlighter.models';
import { ETikTokPrivacyLevel } from 'services/platforms/tiktok/api';
import { DownOutlined, UpOutlined } from '@ant-design/icons';

export default function TikTokUpload(props: {
  defaultTitle: string;
  close: () => void;
  streamId: string | undefined;
}) {
  const streamId = props.streamId;

  // User settings
  const [username, setUsername] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Video settings
  const [title, setTitle] = useState(props.defaultTitle);
  const [description, setDescription] = useState('');
  const [availablePrivacySettings, setAvailablePrivacySettings] = useState<
    ETikTokPrivacyLevel[] | null
  >(null);
  const [privacy, setPrivacy] = useState<ETikTokPrivacyLevel | 'unset'>(
    ETikTokPrivacyLevel.FOLLOWER_OF_CREATOR,
  );

  const [commentAvailable, setCommentAvailable] = useState(false);
  const [commentDisabled, setCommentDisabled] = useState(false);

  const [duetAvailable, setDuetAvailable] = useState(false);
  const [duetDisabled, setDuetDisabled] = useState(false);

  const [stitchAvailable, setStitchAvailable] = useState(false);
  const [stitchDisabled, setStitchDisabled] = useState(false);
  const [maxVideoDuration, setMaxVideoDuration] = useState<number | null>(null);

  const [disclosePostContent, setDisclosePostContent] = useState(false);
  const [yourBrand, setYourBrand] = useState(false);
  const [brandedContent, setBrandedContent] = useState(false);
  const [privacyDropdownIsOpen, setPrivacyDropdown] = useState(false);

  const [showDetails, setShowDetails] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const {
    UserService,
    HighlighterService,
    NavigationService,
    UsageStatisticsService,
    TikTokService,
  } = Services;
  const v = useVuex(() => ({
    tiktokLinked: !!UserService.state.auth?.platforms.tiktok,
    tiktokUploadInfo: HighlighterService.getUploadInfo(
      HighlighterService.views.uploadInfo,
      EUploadPlatform.TIKTOK,
    ),
    exportInfo: HighlighterService.views.exportInfo,
    otherUploadInProgress: HighlighterService.views.uploadInfo
      .filter(info => info.platform !== EUploadPlatform.TIKTOK)
      .some(info => info.uploading),
    tikTokUsername: TikTokService.state.username,
  }));

  // Clear all errors when this component unmounts
  async function setCreatorInfo() {
    const { error, data } = await TikTokService.getCreatorInfo();
    if (error.code !== 'ok') {
      console.log('error');
    } else {
      setCommentAvailable(!data.comment_disabled);
      setDuetAvailable(!data.duet_disabled);
      setStitchAvailable(!data.stitch_disabled);
      setMaxVideoDuration(data.max_video_post_duration_sec);
      setUsername(data.creator_username);
      setAvatarUrl(data.creator_avatar_url);
      setAvailablePrivacySettings(data.privacy_level_options);
      console.log('TikTok creator info:', data);
    }
  }

  useEffect(() => {
    console.log('setCreatorInfo');

    setCreatorInfo();

    return () => HighlighterService.actions.dismissError();
  }, []);

  const options: { label: string; value: ETikTokPrivacyLevel | 'unset'; description: string }[] = [
    {
      label: 'Set privacy status',
      value: 'unset',
      description: $t('Choose the privacy status for your video'),
    },
    {
      label: $t('Only you'),
      value: ETikTokPrivacyLevel.SELF_ONLY,
      description: '',
    },
    {
      label: $t('Friends'),
      value: ETikTokPrivacyLevel.MUTUAL_FOLLOW_FRIENDS,
      description: $t('Followers you follow back'),
    },
    {
      label: $t('Followers'),
      value: ETikTokPrivacyLevel.FOLLOWER_OF_CREATOR,
      description: '',
    },
    {
      label: $t('Everyone'),
      value: ETikTokPrivacyLevel.PUBLIC_TO_EVERYONE,
      description: '',
    },
  ];

  function openExternal(url: string) {
    remote.shell.openExternal(url);
  }

  function getTikTokForm() {
    return (
      <div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
          }}
        >
          {v.tiktokLinked && (
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
                      {options
                        .filter(
                          option =>
                            !(
                              (privacy !== 'unset' && option.value === 'unset') ||
                              availablePrivacySettings?.includes(
                                option.value as ETikTokPrivacyLevel,
                              ) === false
                            ),
                        )
                        .map(option => {
                          return (
                            <div
                              className={`${styles.innerDropdownItem} ${
                                option.value === privacy ? styles.active : ''
                              }`}
                              onClick={() => {
                                setPrivacy(option.value);
                                setPrivacyDropdown(false);
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
                  visible={privacyDropdownIsOpen}
                  onVisibleChange={setPrivacyDropdown}
                  placement="bottomLeft"
                >
                  <div
                    className={styles.innerDropdownWrapper}
                    onClick={() => setPrivacyDropdown(!privacyDropdownIsOpen)}
                  >
                    <div className={styles.dropdownText}>
                      {options.find(option => option.value === privacy)?.label}
                    </div>
                    <i className="icon-down"></i>
                  </div>
                </Dropdown>

                <div
                  style={{
                    marginTop: 16,
                    marginBottom: 12,
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'space-between',
                    cursor: disclosePostContent && showDetails ? 'default' : 'pointer',
                  }}
                  onClick={() => {
                    if (disclosePostContent && showDetails) {
                      // Prevent hiding details. User should see that disclosePostContent is enabled
                    } else {
                      setShowDetails(!showDetails);
                    }
                  }}
                >
                  <p style={{ margin: 0 }}> Show more options</p>
                  {showDetails ? (
                    <UpOutlined style={{ color: '#BDC2C4' }} />
                  ) : (
                    <DownOutlined style={{ color: '#BDC2C4' }} />
                  )}
                </div>

                {showDetails && (
                  <>
                    <div style={{ marginTop: 16, marginBottom: 12 }}>
                      <Checkbox
                        checked={commentDisabled}
                        disabled={!commentAvailable}
                        onChange={e => {
                          setCommentDisabled(e.target.checked);
                        }}
                      >
                        {$t('Comment')}
                      </Checkbox>
                      <Checkbox
                        checked={duetDisabled}
                        disabled={!duetAvailable}
                        onChange={e => {
                          setDuetDisabled(e.target.checked);
                        }}
                      >
                        {$t('Duet')}
                      </Checkbox>
                      <Checkbox
                        disabled={!stitchAvailable}
                        checked={stitchDisabled}
                        onChange={e => {
                          setStitchDisabled(e.target.checked);
                        }}
                      >
                        {$t('Stitch')}
                      </Checkbox>
                    </div>

                    <div>
                      {' '}
                      <SwitchInput
                        style={{ margin: 0 }}
                        value={disclosePostContent}
                        label={
                          <div
                            style={{ display: 'flex', flexDirection: 'column', marginBottom: -8 }}
                          >
                            <p style={{ margin: 0 }}>Disclose post content</p>
                            <p style={{ margin: 0, fontSize: '12px' }}>
                              Let others know this post promotes a brand, product or service
                            </p>
                          </div>
                        }
                        onChange={bool => {
                          setDisclosePostContent(bool);
                          if (!bool) {
                            setBrandedContent(false);
                            setYourBrand(false);
                          }
                        }}
                      />
                      {disclosePostContent && (
                        <div style={{ marginTop: 8 }}>
                          <Checkbox
                            checked={yourBrand}
                            onChange={e => {
                              setYourBrand(e.target.checked);
                            }}
                          >
                            {$t('Your brand')}
                          </Checkbox>
                          <Checkbox
                            checked={brandedContent}
                            onChange={e => {
                              setBrandedContent(e.target.checked);
                            }}
                          >
                            {$t('Branded content')}
                          </Checkbox>
                          {yourBrand && brandedContent && (
                            <p> Your photo/video will be labeled as Paid partnership </p>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
                <p style={{ marginTop: 16, marginBottom: 0 }}>
                  By posting, you agree to TikTok's
                  <a
                    style={{ marginLeft: 8, textDecoration: 'underline' }}
                    onClick={() =>
                      openExternal(
                        'https://www.tiktok.com/legal/page/global/music-usage-confirmation/en',
                      )
                    }
                  >
                    Music Usage Confirmation
                  </a>
                </p>
              </Form>
            </div>
          )}
          {!v.tiktokLinked && (
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
        {v.tiktokUploadInfo?.error && (
          <Alert
            style={{ marginBottom: 8, marginTop: 8 }}
            message={$t('An error occurred while uploading to YouTube')}
            type="error"
            closable
            showIcon
            afterClose={() => HighlighterService.actions.dismissError()}
          />
        )}
        {v.tiktokLinked && (
          <Tooltip
            title={
              disclosePostContent &&
              !yourBrand &&
              !brandedContent &&
              $t('You need to indicate if your content promotes yourself, a third party, or both.')
            }
          >
            <Button
              type="primary"
              size="large"
              style={{
                width: '100%',
                marginTop: '16px',
                pointerEvents: v.otherUploadInProgress ? 'none' : 'auto',
                opacity: v.otherUploadInProgress ? '0.6' : '1',
              }}
              disabled={disclosePostContent && !yourBrand && !brandedContent}
              onClick={() => {
                console.log('Uploading to TikTok with options:');

                // UsageStatisticsService.actions.recordFeatureUsage('HighlighterUpload');
                // HighlighterService.actions.uploadYoutube(
                //   {
                //     title,
                //     description,
                //     privacyStatus: privacy as ET,
                //   },
                //   streamId,
                // );
              }}
            >
              {/* {$t('Post as %{username}', { username })} */}
              {avatarUrl && (
                <img
                  style={{
                    height: '25px',
                    transform: 'translateY(-1px)',
                    borderRadius: '100%',
                    marginRight: 5,
                  }}
                  src={avatarUrl}
                />
              )}
              {$t('Post as')} <span style={{ marginLeft: 5, fontWeight: 'bold' }}>{username}</span>
            </Button>
          </Tooltip>
        )}
      </div>
    );
  }

  function getUploadDone() {
    const url = `https://youtube.com/watch?v=${v.tiktokUploadInfo?.videoId}`;

    return (
      <div>
        <p>
          {$t(
            'Your video was successfully uploaded! Click the link below to access your video. Please note that YouTube will take some time to process your video.',
          )}
        </p>
        <br />
        <a onClick={() => openExternal(url)}>{url}</a>
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
      {!v.tiktokUploadInfo?.uploading && !v.tiktokUploadInfo?.videoId && getTikTokForm()}
      {v.tiktokLinked && v.tiktokUploadInfo?.uploading && (
        <UploadProgress platform={EUploadPlatform.TIKTOK} />
      )}
      {v.tiktokLinked && v.tiktokUploadInfo?.videoId && getUploadDone()}
    </div>
  );
}
