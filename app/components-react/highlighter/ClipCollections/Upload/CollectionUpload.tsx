import { Form, Dropdown, Button, Collapse, CollapseProps } from 'antd';
import { useVuex } from 'components-react/hooks';
import { useController } from 'components-react/hooks/zustand';
import { ListInput } from 'components-react/shared/inputs';
import React, { useEffect, useState } from 'react';
import { TOrientation, EOrientation } from 'services/highlighter/models/ai-highlighter.models';
import { $t } from 'services/i18n';
import { Services } from 'components-react/service-provider';
import styles from '../../Export/ExportModal.m.less';
import { $i } from 'services/utils';
import * as remote from '@electron/remote';
import { EUploadPlatform } from 'services/highlighter/models/highlighter.models';
import YoutubeUpload from 'components-react/highlighter/Export/YoutubeUpload';
import VideoPreview from 'components-react/highlighter/Export/VideoPreview';

export default function CollectionUpload({
  close,
  collectionIds,
}: {
  close: () => void;
  collectionIds: string[];
}) {
  const { UserService, HighlighterService } = Services;

  const { isYoutubeLinked } = useVuex(() => ({
    isYoutubeLinked: !!UserService.state.auth?.platforms.youtube,
  }));

  const items = collectionIds.map((id, index) => {
    const collectionTitle =
      HighlighterService.views.clipCollectionsDictionary[id]?.clipCollectionInfo.title || 'title';

    const item = {
      key: index,
      label: collectionTitle,
      children: (
        <YoutubeUpload
          defaultTitle={collectionTitle}
          close={close}
          streamId={undefined}
          collectionId={id}
        />
      ),
    };

    return item;
  });

  return (
    <div className={styles.modalWrapper}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h2 style={{ fontWeight: 600, margin: 0 }}>{$t('Publish to')}</h2>{' '}
        <div>
          <Button type="text" onClick={close}>
            <i className="icon-close" style={{ margin: 0 }}></i>
          </Button>
        </div>
      </div>
      {/* <div style={{ display: 'flex', gap: '16px', cursor: 'pointer' }} onClick={openInFolder}>
        <h2 className={styles.customInput} style={{ width: 'fit-content', whiteSpace: 'nowrap' }}>
          {videoName}
        </h2>
        <p style={{ width: 'fit-content', whiteSpace: 'nowrap' }}>
          {clipsDuration} | {clipsAmount} clips
        </p>
      </div> */}
      <div className={styles.publishWrapper} style={{ gridTemplateColumns: '1fr' }}>
        <div
          style={{
            width: '100%',
            height: '700px',
            overflowY: 'scroll',
            paddingRight: '8px',
          }}
        >
          <Collapse expandIconPosition="right" defaultActiveKey={undefined} bordered={false}>
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
        <Button
          type="primary"
          size="large"
          style={{
            width: '100%',
            marginTop: '16px',
          }}
          onClick={() => {
            // UsageStatisticsService.actions.recordFeatureUsage('HighlighterUpload');

            if (collectionIds.length > 0) {
              collectionIds.forEach(id => {
                // If published already, skip
                if (
                  HighlighterService.clipCollectionManager.collectionIsPublished(
                    id,
                    EUploadPlatform.YOUTUBE,
                  )
                ) {
                  return;
                }

                HighlighterService.actions.queueUploadClipCollection(id);
              });

              close();
              return;
            }
          }}
        >
          {$t('Publish all')}
        </Button>
      </div>
    </div>
  );
}
