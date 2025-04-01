import React, { useEffect, useRef, useState, RefObject } from 'react';
import { TClip } from 'services/highlighter/models/highlighter.models';
import { SCRUB_FRAMES, SCRUB_HEIGHT, SCRUB_WIDTH } from 'services/highlighter/constants';
import { Services } from 'components-react/service-provider';
import times from 'lodash/times';
import styles from './ClipTrimmer.m.less';
import cx from 'classnames';
import { $t } from 'services/i18n';

type TDragType = 'start' | 'end';

/**
 * When you need a mix of state and ref semantics, this can help
 * keep them both in sync
 * @param initialValue The initial value
 */
function useStateRef<T>(initialValue: T): [RefObject<T>, (newValue: T) => void] {
  const [state, setState] = useState(initialValue);
  const ref = useRef(initialValue);

  return [
    ref,
    val => {
      setState(val);
      ref.current = val;
    },
  ];
}

export default function ClipTrimmer(props: { clip: TClip }) {
  const { HighlighterService, UsageStatisticsService } = Services;
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const startDragRef = useRef<HTMLDivElement>(null);
  const endDragRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(props.clip.startTrim);
  const [scrubFrames, setScrubFrames] = useState<number[]>([]);
  const [localStartTrim, setLocalStartTrim] = useState(props.clip.startTrim);
  const [localEndTrim, setLocalEndTrim] = useState(props.clip.endTrim);
  const playPastEnd = useRef(false);
  const isDragging = useRef<TDragType | null>(null);
  const dragOffset = useRef(0);
  const isScrubbing = useRef(false);
  const [isPlaying, setIsPlaying] = useStateRef(false);

  const endTime = props.clip.duration! - localEndTrim;

  function playAt(t: number) {
    if (!videoRef.current) return;

    setIsPlaying(true);
    videoRef.current.currentTime = t;
    videoRef.current.play();

    playPastEnd.current = t > endTime;

    updatePlayhead();
  }

  function updatePlayhead() {
    if (!videoRef.current) return;

    setCurrentTime(videoRef.current.currentTime);

    if (!playPastEnd.current && videoRef.current.currentTime >= endTime) stopPlaying();

    if (isPlaying.current) {
      requestAnimationFrame(updatePlayhead);
    }
  }

  function stopPlaying() {
    if (!videoRef.current) return;

    setIsPlaying(false);
    videoRef.current.pause();
  }

  function togglePlayPause() {
    if (isPlaying.current) {
      stopPlaying();
    } else {
      playAt(localStartTrim);
    }
  }

  useEffect(() => {
    playAt(localStartTrim);

    return stopPlaying;
  }, []);

  function startDragging(e: React.MouseEvent, type: TDragType) {
    isDragging.current = type;
    dragOffset.current =
      type === 'start'
        ? startDragRef.current!.getBoundingClientRect().right - e.clientX
        : e.clientX - endDragRef.current!.getBoundingClientRect().left;
  }

  function onMouseDown() {
    if (isDragging.current) return;
    stopPlaying();
    isScrubbing.current = true;
  }

  function onMouseUp(e: React.MouseEvent) {
    if (isDragging.current) {
      stopDragging();
    } else {
      isScrubbing.current = false;
      const timelineWidth = timelineRef.current!.offsetWidth - 40;
      const timelineOffset = timelineRef.current!.getBoundingClientRect().left + 20;
      playAt(((e.clientX - timelineOffset) / timelineWidth) * props.clip.duration!);
    }
  }

  function onMouseMove(e: React.MouseEvent) {
    const timelineWidth = timelineRef.current!.offsetWidth - 40;

    if (isDragging.current) {
      if (isDragging.current === 'start') {
        const timelineOffset = timelineRef.current!.getBoundingClientRect().left + 20;
        const time =
          ((e.clientX + dragOffset.current - timelineOffset) / timelineWidth) *
          props.clip.duration!;
        setLocalStartTrim(Math.max(Math.min(time, endTime), 0));
      } else {
        const timelineOffset = timelineRef.current!.getBoundingClientRect().right - 20;
        const time =
          ((timelineOffset + dragOffset.current - e.clientX) / timelineWidth) *
          props.clip.duration!;
        setLocalEndTrim(Math.max(Math.min(time, props.clip.duration! - localStartTrim), 0));
      }
    } else if (isScrubbing.current) {
      if (!videoRef.current) return;
      const timelineOffset = timelineRef.current!.getBoundingClientRect().left + 20;
      const time = ((e.clientX - timelineOffset) / timelineWidth) * props.clip.duration!;

      videoRef.current.currentTime = time;
      updatePlayhead();
    }
  }

  function onMouseLeave() {
    isScrubbing.current = false;

    if (isDragging.current) stopDragging();
  }

  function stopDragging() {
    if (isDragging.current === 'start') {
      HighlighterService.actions.setStartTrim(props.clip.path, localStartTrim);
    } else if (isDragging.current === 'end') {
      HighlighterService.actions.setEndTrim(props.clip.path, localEndTrim);
    }

    isDragging.current = null;
    playAt(localStartTrim);

    UsageStatisticsService.actions.recordAnalyticsEvent(
      HighlighterService.state.useAiHighlighter ? 'AIHighlighter' : 'Highlighter',
      { type: 'Trim' },
    );
  }

  const scrubHeight = 100;
  const scrubWidth = scrubHeight * (SCRUB_WIDTH / SCRUB_HEIGHT);

  // TODO: React to window size change
  useEffect(() => {
    const timelineWidth = timelineRef.current!.offsetWidth - 40;
    // Always add 1 frame so it fully covers
    const nFrames = Math.floor(timelineWidth / scrubWidth) + 1;
    setScrubFrames(
      times(nFrames).map(n => {
        return Math.floor((n / (nFrames - 1)) * (SCRUB_FRAMES - 1));
      }),
    );
  }, []);

  const startTrimPct = (localStartTrim / props.clip.duration!) * 100;
  const endTrimPct = (localEndTrim / props.clip.duration!) * 100;

  return (
    <div>
      <video
        ref={videoRef}
        src={props.clip.path.replace('#', '%23')}
        style={{ borderRadius: 5 }}
        width="100%"
        onEnded={() => {
          setIsPlaying(false);
        }}
        onClick={togglePlayPause}
      />
      <h3 style={{ margin: '6px 0 10px' }}>{$t('Trim Clip')}</h3>
      <div
        ref={timelineRef}
        style={{
          width: '100%',
          height: scrubHeight,
          position: 'relative',
          background: 'var(--section)',
          marginTop: 10,
          borderRadius: 5,
          borderLeft: '20px solid transparent',
          borderRight: '20px solid transparent',
        }}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
      >
        <div style={{ display: 'flex', overflow: 'hidden', position: 'absolute' }}>
          {scrubFrames.map(frame => {
            return (
              <img
                key={frame}
                src={props.clip.scrubSprite?.replace('#', '%23')}
                width={SCRUB_WIDTH}
                height={SCRUB_HEIGHT}
                style={{
                  height: scrubHeight,
                  width: scrubWidth,
                  objectFit: 'cover',
                  objectPosition: `-${frame * SCRUB_WIDTH * (scrubHeight / SCRUB_HEIGHT)}px`,
                  pointerEvents: 'none',
                  maxWidth: '100%',
                }}
              ></img>
            );
          })}
        </div>
        <div
          style={{
            left: `${(currentTime / props.clip.duration!) * 100}%`,
          }}
          className={cx(styles.clipPlayhead, { [styles.clipPlayheadPlaying]: isPlaying.current })}
        ></div>
        <div style={{ position: 'absolute', width: '100%', height: '100%' }}>
          <div
            style={{
              width: `calc(${startTrimPct}% + 20px)`,
              height: '100%',
              position: 'absolute',
              left: -20,
              background: 'rgba(0,0,0,0.9)',
              borderRadius: 5,
            }}
          ></div>
          <div
            style={{
              position: 'absolute',
              left: `calc(${startTrimPct}% - 20px)`,
              width: 20,
              height: '100%',
              background: 'var(--teal)',
              borderTopLeftRadius: 5,
              borderBottomLeftRadius: 5,
              zIndex: 100,
              cursor: 'pointer',
              color: 'var(--title)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            }}
            onMouseDown={e => startDragging(e, 'start')}
            ref={startDragRef}
          >
            <i className="fas fa-chevron-left" />
          </div>
          <div
            style={{
              position: 'absolute',
              width: `${100 - startTrimPct - endTrimPct}%`,
              height: '100%',
              left: `${startTrimPct}%`,
              borderTop: '5px solid var(--teal)',
              borderBottom: '5px solid var(--teal)',
            }}
          ></div>
          <div
            style={{
              position: 'absolute',
              right: `calc(${endTrimPct}% - 20px)`,
              width: 20,
              height: '100%',
              background: 'var(--teal)',
              borderTopRightRadius: 5,
              borderBottomRightRadius: 5,
              zIndex: 100,
              cursor: 'pointer',
              color: 'var(--title)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            }}
            onMouseDown={e => startDragging(e, 'end')}
            ref={endDragRef}
          >
            <i className="fas fa-chevron-right" />
          </div>
          <div
            style={{
              width: `calc(${endTrimPct}% + 20px)`,
              height: '100%',
              position: 'absolute',
              right: -20,
              background: 'rgba(0,0,0,0.9)',
              borderRadius: 5,
            }}
          ></div>
        </div>
      </div>
    </div>
  );
}
