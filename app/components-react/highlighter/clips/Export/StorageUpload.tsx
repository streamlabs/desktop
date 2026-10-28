import React, { useEffect } from 'react';
import * as remote from '@electron/remote';
import cx from 'classnames';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import { $t } from 'services/i18n';
import Translate from 'components-react/shared/Translate';
import UploadProgress from './UploadProgress';
import styles from './ExportModal.m.less';
import VideoPreview from './VideoPreview';
import { EPlatformCallResult } from 'services/platforms';
import { EUploadPlatform } from 'services/highlighter/models/highlighter.models';
import { ModalLayout } from 'components-react/shared/ModalLayout';
import { has } from 'lodash';
import { Modal } from 'antd';

export default function StorageUpload(p: { onClose: () => void; platform: EUploadPlatform }) {
  const { UserService, HighlighterService, SharedStorageService } = Services;

  const { uploadInfo, hasSLID } = useVuex(() => ({
    uploadInfo: HighlighterService.getUploadInfo(HighlighterService.views.uploadInfo, p.platform),
    hasSLID: !!UserService.views.auth?.slid?.id,
  }));

  const [showSlidLoginModal, setShowSlidLoginModal] = React.useState(false);

  function uploadStorage() {
    // First check if there is an existing upload for another platform
    const existingUpload = HighlighterService.views.state.uploads.find(
      upload =>
        [
          EUploadPlatform.CROSSCLIP,
          EUploadPlatform.TYPESTUDIO,
          EUploadPlatform.VIDEOEDITOR,
        ].includes(upload.platform) && upload.videoId,
    );

    if (existingUpload?.videoId) {
      HighlighterService.SET_UPLOAD_INFO({
        platform: p.platform,
        videoId: existingUpload.videoId,
      });
    } else {
      HighlighterService.actions.uploadStorage(p.platform);
    }
  }

  useEffect(() => {
    if (uploadInfo?.videoId) {
      remote.shell.openExternal(
        SharedStorageService.views.getPlatformLink(p.platform, uploadInfo.videoId),
      );
      p.onClose();
    }
  }, [uploadInfo?.videoId]);

  // Clear all errors when this component unmounts
  useEffect(() => {
    return () => HighlighterService.actions.dismissError();
  }, []);

  if (uploadInfo?.uploading && uploadInfo.platform === p.platform) {
    return <UploadProgress platform={p.platform} dense />;
  }
  return (
    <>
      <Modal
        visible={showSlidLoginModal}
        onCancel={() => setShowSlidLoginModal(false)}
        closable={true}
        destroyOnClose={true}
        footer={null}
        title={$t('Sign in with Streamlabs ID')}
        width={400}
      >
        <GetSLID onLogin={uploadStorage} />
      </Modal>

      {uploadInfo?.videoId ? (
        <button
          className={styles.uploadButton}
          onClick={() => {
            if (!uploadInfo.videoId) {
              return;
            }
            remote.shell.openExternal(
              SharedStorageService.views.getPlatformLink(p.platform, uploadInfo.videoId),
            );
          }}
        >
          {$t('Open')}
        </button>
      ) : (
        <button
          disabled={uploadInfo?.uploading}
          className={styles.uploadButton}
          onClick={() => {
            if (!hasSLID) {
              setShowSlidLoginModal(true);
            } else {
              uploadStorage();
            }
          }}
        >
          {$t('Upload')}
        </button>
      )}
    </>
  );
}

export function GetSLID(p: { onLogin?: () => void }) {
  const { UserService, OnboardingService } = Services;

  async function clickLink(signup?: boolean) {
    let resp: EPlatformCallResult;
    const platform = UserService.views.platform?.type;

    if (UserService.views.isLoggedIn) {
      resp = await UserService.actions.return.startSLMerge();
    } else {
      resp = await UserService.actions.return.startSLAuth({ signup });
    }

    if (resp !== EPlatformCallResult.Success) return;
    if (platform) {
      UserService.actions.setPrimaryPlatform(platform);
    } else {
      OnboardingService.actions.start({ isLogin: true });
    }
    if (p.onLogin) p.onLogin();
  }

  return (
    <div className={styles.crossclipContainer}>
      <h2 className={styles.signUpTitle}>{$t('This feature requires a Streamlabs ID')}</h2>
      <button
        className="button button--action"
        style={{ width: '300px', margin: '32px' }}
        onClick={() => clickLink(true)}
      >
        {$t('Sign up for Streamlabs ID')}
      </button>
      <span className={styles.login}>
        <Translate message="Already have a Streamlabs ID? <link>Login</link>">
          <a slot="link" onClick={() => clickLink()} />
        </Translate>
      </span>
    </div>
  );
}
