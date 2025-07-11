import { Button, Modal } from 'antd';
import React, { useEffect, useState } from 'react';
import { EAiDetectionState } from 'services/highlighter/models/ai-highlighter.models';
import { getConfigByGame } from 'services/highlighter/models/game-config.models';
import {
  IHighlightedStream,
  TClip,
  IViewState,
  EHighlighterView,
} from 'services/highlighter/models/highlighter.models';
import StreamCardInfo from '../../StreamCardInfo';
import { TModalStreamCard } from '../../StreamCardModal';
import { Services } from 'components-react/service-provider';
import StreamClipSuggestionModal from './HeaderModal';
import ActionBar from './Actionbar';
import styles from './Header.m.less';

export default function Header({
  streamInfo,
  clips,
  clipCollectionIds,
  emitSetView,
}: {
  streamInfo: IHighlightedStream;
  clips: TClip[];
  clipCollectionIds: string[];
  emitSetView: (data: IViewState) => void;
}) {
  console.log('🎨: Header', streamInfo.id);

  const { HighlighterService } = Services;
  const [modal, setModal] = useState<TModalStreamCard | null>(null);
  const game = HighlighterService.getGameByStreamId(streamInfo.id);
  const gameConfig = getConfigByGame(game);

  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        gap: 8,
        justifyContent: 'space-between',
        borderTop: '1px solid #d9d9d950',
        paddingTop: '8px',
        marginRight: '16px',
      }}
    >
      <StreamClipSuggestionModal
        collectionIds={clipCollectionIds}
        modal={modal}
        clips={clips}
        onClose={() => {
          setModal(null);
        }}
      />
      {/* Left */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
        onClick={() => {
          emitSetView({ view: EHighlighterView.CLIPS, id: streamInfo.id });
        }}
      >
        <img src={gameConfig?.thumbnail} width="22" height="22" alt="Game thumbnail" />
        <h2 className={styles.streamcardTitle}>{streamInfo.title}</h2>
        <h3 style={{ margin: 0, opacity: 0.6 }}>
          {streamInfo.state.type === EAiDetectionState.FINISHED && (
            <StreamCardInfo clips={clips} game={game} />
          )}
        </h3>
      </div>
      {/* Right */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '50%',
          marginRight: 8,
          justifyContent: 'flex-end',
        }}
      >
        <ActionBar
          stream={streamInfo}
          clips={clips}
          emitExportVideo={() => {
            setModal('export');
          }}
          emitShowStreamClips={() => {
            emitSetView({ view: EHighlighterView.CLIPS, id: streamInfo.id });
          }}
          emitSetView={emitSetView}
          // TODO add modals
          emitFeedbackForm={() => {
            setModal('feedback');
          }}
        />
      </div>
    </div>
  );
}
