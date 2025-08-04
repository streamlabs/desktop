import React, { useEffect, useState } from 'react';
import { Tooltip, Button } from 'antd';
import { TooltipPlacement } from 'antd/lib/tooltip';
import styles from './RealtimeHighlightsFeed.m.less';
import { EGame, IHighlight } from 'services/highlighter/models/ai-highlighter.models';
import { HighlighterService } from 'app-services';
import { Services } from '../../service-provider';
import { useVuex } from '../../hooks';
import {
  EHighlighterView,
  INewClipData,
  TClip,
} from 'services/highlighter/models/highlighter.models';
import { Subscription } from 'rxjs';
import RealtimeHighlightsItem from './RealtimeHighlightsItem';
import { useRealmObject } from '../../hooks/realm';
import { EMenuItemKey } from 'services/side-nav';
import Utils from 'services/utils';
import RealtimeIndicator from '../RealtimeIndicator';
import { IRealtimeHighlightClipData } from 'services/highlighter/realtime-highlighter-service';

interface IRealtimeHighlightTooltipProps {
  placement?: TooltipPlacement;
  trigger?:
    | 'hover'
    | 'click'
    | 'focus'
    | 'contextMenu'
    | Array<'hover' | 'click' | 'focus' | 'contextMenu'>;
  maxEvents?: number;
}

export type TRealtimeFeedEvent = {
  type: string;
  game: EGame;
};

export default function RealtimeHighlightsTooltip(props: IRealtimeHighlightTooltipProps) {
  const { placement, trigger, maxEvents = 5 } = props;
  const { HighlighterService, RealtimeHighlighterService, NavigationService } = Services;
  const [lastEvent, setLastEvent] = useState<TRealtimeFeedEvent | null>(null);
  const [showTooltip, setShowTooltip] = useState<true | undefined>(undefined);

  const [highlightClips, setHighlightClips] = useState<IRealtimeHighlightClipData[]>([]);
  let hasMoreEvents = false;
  const isDevMode = Utils.isDevMode();

  const currentGame = useRealmObject(RealtimeHighlighterService.ephemeralState).game;
  let realtimeHighlightSubscription: Subscription | null = null;
  let realtimeEventSubscription: Subscription | null = null;
  useEffect(() => {
    // Initialize component
    console.log('Initializing RealtimeEventTooltip component');

    realtimeHighlightSubscription = RealtimeHighlighterService.highlightsReady.subscribe(
      realtimeClipData => {
        // This will be called when highlights are ready
        const highlights = Object.values(realtimeClipData);
        setHighlightClips(prevEvents => {
          const updatedEvents = [...prevEvents, ...highlights];
          // Remove excess events from the beginning if we exceed maxEvents
          if (updatedEvents.length > maxEvents) {
            updatedEvents.splice(0, updatedEvents.length - maxEvents);
          }
          return updatedEvents;
        });
        hasMoreEvents = highlights.length > maxEvents;
        console.log('Realtime highlights are ready:', realtimeClipData);
      },
    );

    realtimeEventSubscription = RealtimeHighlighterService.latestDetectedEvent.subscribe(event => {
      if (!event || !event.type) return;
      setLastEvent({ type: event.type, game: event.game });
    });

    // On unmount, unsubscribe from the realtime highlights
    return () => {
      realtimeEventSubscription?.unsubscribe();
      realtimeHighlightSubscription?.unsubscribe();
    };
  }, []);

  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (highlightClips) {
      setShowTooltip(true);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      timeoutRef.current = setTimeout(() => {
        setShowTooltip(undefined);
      }, 5000);
    }
  }, [highlightClips]);

  function onViewAll() {
    // Navigate to the Highlighter stream view
    NavigationService.actions.navigate(
      'Highlighter',
      {
        view: EHighlighterView.STREAM,
      },
      EMenuItemKey.Highlighter,
    );
  }

  function onEventItemClick(streamId: string) {
    console.log('Open single highlight view for event:', streamId);
    // Navigate to specific highlight in stream
    NavigationService.actions.navigate(
      'Highlighter',
      {
        view: EHighlighterView.CLIPS,
        id: streamId,
      },
      EMenuItemKey.Highlighter,
    );
  }

  function getItemOpacity(index: number) {
    if (index === highlightClips.length - 1) return 1;
    if (index === highlightClips.length - 2) return 0.75;
    return 0.5;
  }

  const tooltipContent = (
    <div className={styles.eventTooltipContent}>
      <h2>Clipped highlights</h2>
      <div className={styles.eventList}>
        {hasMoreEvents && (
          <div className={styles.eventFooter}>
            <Button
              type="primary"
              size="small"
              onClick={e => {
                e.stopPropagation();
                onViewAll();
              }}
              className={styles.viewAllButton}
            >
              View all highlights
            </Button>
          </div>
        )}

        {highlightClips.length === 0 && <p>Your clipped highlights will appear here</p>}

        {highlightClips &&
          highlightClips.map((clipData, index) => (
            <div
              key={index}
              style={{
                opacity: getItemOpacity(index),
              }}
            >
              <RealtimeHighlightsItem
                key={clipData.path}
                clipData={clipData}
                game={currentGame}
                onEventItemClick={() => {
                  onEventItemClick(clipData.streamId);
                }}
                latestItem={highlightClips.length - 1 === index}
              />
            </div>
          ))}
      </div>
    </div>
  );

  return (
    <Tooltip
      title={tooltipContent}
      placement={placement}
      trigger={trigger}
      overlayClassName={styles.eventTooltip}
      autoAdjustOverflow={false}
      visible={showTooltip}
    >
      <div
        onMouseEnter={() => {
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
        }}
        onMouseLeave={() => {
          if (showTooltip) {
            setShowTooltip(undefined);
          }
        }}
      >
        <RealtimeIndicator
          eventType={lastEvent || undefined}
          emitCancel={() => {
            RealtimeHighlighterService.actions.stop();
          }}
        />
      </div>
    </Tooltip>
  );
}
