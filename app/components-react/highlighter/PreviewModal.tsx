import React, { useEffect, useRef, useState } from 'react';
import { Services } from 'components-react/service-provider';
import { $t } from 'services/i18n';
import { TClip } from 'services/highlighter/models/highlighter.models';
import { sortClipsByOrder, getCombinedClipsDuration } from './utils';
import MiniClipPreview from './MiniClipPreview';
import { PauseButton, PlayButton } from './StreamCard';
import styles from './PreviewModal.m.less';
import { Button } from 'antd';
import { TModalClipsView } from './ClipsView';
import { CheckboxInput } from 'components-react/shared/inputs';
import { formatSecondsToHMS } from './ClipPreview';
import { duration } from 'moment';

interface IPlaylist {
  src: string;
  path: string;
  start: number;
  end: number;
  type: string;
  enabled: boolean;
  duration: number;
}

export default function PreviewModal({
  close,
  streamId,
  emitSetShowModal,
}: {
  close: () => void;
  streamId: string | undefined;
  emitSetShowModal: (modal: TModalClipsView | null) => void;
}) {
  const { HighlighterService, UsageStatisticsService } = Services;
  const clips = HighlighterService.getClips(HighlighterService.views.clips, streamId);
  const { intro, outro } = HighlighterService.views.video;
  const audioSettings = HighlighterService.views.audio;
  const sortedClips = [...sortClipsByOrder(clips, streamId)];
  const initialIndex = getInitialIndex(intro.duration, sortedClips);
  const [currentClipIndex, setCurrentClipIndex] = useState(initialIndex);
  const currentClipIndexRef = useRef(initialIndex);
  const [showDisabled, setShowDisabled] = useState(true);

  useEffect(() => {
    UsageStatisticsService.recordShown('ClipsPreview', streamId);
  }, []);

  function getInitialIndex(introDuration: number | null, sortedClips: TClip[]): number {
    if (introDuration) return 0;
    const firstEnabledIndex = sortedClips.findIndex(clip => clip.enabled);
    return firstEnabledIndex === -1 ? 0 : firstEnabledIndex;
  }

  const playlist: IPlaylist[] = [
    ...(intro.duration && intro.path
      ? [
          {
            src: intro.path,
            path: intro.path,
            start: 0,
            end: intro.duration,
            type: 'video/mp4',
            enabled: true,
            duration: intro.duration,
          },
        ]
      : []),
    ...sortedClips.map((clip: TClip) => ({
      src: clip.path + `#t=${clip.startTrim},${clip.duration! - clip.endTrim}`,
      path: clip.path,
      start: clip.startTrim,
      end: clip.duration! - clip.endTrim,
      type: 'video/mp4',
      enabled: clip.enabled,
      duration: clip.duration! - clip.endTrim - clip.startTrim,
    })),
    ...(outro.duration && outro.path
      ? [
          {
            src: outro.path,
            path: outro.path,
            start: 0,
            end: outro.duration,
            type: 'video/mp4',
            enabled: true,
            duration: outro.duration,
          },
        ]
      : []),
  ];
  const videoPlayer = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const isChangingClip = useRef(false);
  const [isPlaying, setIsPlaying] = useState(true);

  function isRoughlyEqual(a: number, b: number, tolerance: number = 0.3): boolean {
    return Math.abs(a - b) <= tolerance;
  }

  const findNextEnabledClipIndex = (currentIndex: number): number => {
    const enabledIndices = playlist
      .map((clip, index) => (clip.enabled ? index : -1))
      .filter(index => index !== -1);

    if (enabledIndices.length === 0) return currentIndex;

    // Find next enabled index after current
    const nextIndex = enabledIndices.find(index => index > currentIndex);
    return nextIndex ?? enabledIndices[0]; // Wrap around if at end
  };

  const nextClip = () => {
    if (!isChangingClip.current) {
      isChangingClip.current = true;

      setCurrentClipIndex(prevIndex => {
        const newIndex = findNextEnabledClipIndex(prevIndex);

        playAudio(newIndex, true);

        return newIndex;
      });
    }
  };

  useEffect(() => {
    if (!videoPlayer.current) {
      return;
    }

    const handleEnded = () => {
      nextClip();
    };

    const handlePause = () => {
      // sometimes player fires paused event before ended, in this case we need to compare timestamps
      // and check if we are at the end of the clip
      const currentTime = videoPlayer.current!.currentTime;
      const endTime = playlist[currentClipIndexRef.current].end;

      if (currentTime >= endTime || isRoughlyEqual(currentTime, endTime)) {
        nextClip();
      }
    };

    const handlePlay = () => {
      setIsPlaying(true);
    };

    const handleAudioEnd = () => {
      audio.current!.currentTime = 0;
      audio.current!.play().catch(e => console.error('Error playing audio:', e));
    };

    videoPlayer.current.addEventListener('ended', handleEnded);
    videoPlayer.current.addEventListener('play', handlePlay);
    videoPlayer.current.addEventListener('pause', handlePause);

    if (audioSettings.musicEnabled && audioSettings.musicPath && playlist.length > 0) {
      audio.current = new Audio(audioSettings.musicPath);
      audio.current.volume = audioSettings.musicVolume / 100;
      audio.current.autoplay = true;
      audio.current.addEventListener('ended', handleAudioEnd);
    }

    return () => {
      videoPlayer.current?.removeEventListener('ended', handleEnded);
      videoPlayer.current?.removeEventListener('play', handlePlay);
      videoPlayer.current?.removeEventListener('pause', handlePause);
      if (audio.current) {
        audio.current.pause();
        audio.current.removeEventListener('ended', handleAudioEnd);
        audio.current = null;
      }
    };
  }, [playlist.filter(clip => clip.enabled).length, videoPlayer.current]);

  useEffect(() => {
    currentClipIndexRef.current = currentClipIndex;
    if (videoPlayer.current === null || playlist.length === 0) {
      return;
    }
    videoPlayer.current!.src = playlist[currentClipIndex].src;
    videoPlayer.current!.load();
    videoPlayer.current!.play().catch(e => console.error('Error playing video:', e));
    isChangingClip.current = false;
    // currently its done by querying DOM, don't want to store a giant array of refs
    // that wont be used otherwise
    document.getElementById('preview-' + currentClipIndex)?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'center',
    });
  }, [currentClipIndex]);

  function togglePlay() {
    const currentPlayer = videoPlayer.current;
    if (currentPlayer?.paused) {
      currentPlayer.play().catch(e => console.error('Error playing video:', e));
      if (audio.current && audio.current.currentTime > 0) {
        audio.current?.play().catch(e => console.error('Error playing audio:', e));
      }
    } else {
      setIsPlaying(false);
      currentPlayer?.pause();
      audio.current?.pause();
    }
  }

  function playPauseButton() {
    if (isPlaying) {
      return <PauseButton />;
    } else {
      return <PlayButton />;
    }
  }

  function jumpToClip(index: number) {
    if (currentClipIndex === index) {
      return;
    }
    setCurrentClipIndex(index);

    playAudio(index);
  }

  function playAudio(index: number, continuation = false) {
    // if its a continuation of a previous segment, no need to seek
    // and introduce playback lag
    if (continuation || !audio.current) {
      return;
    }

    // clips don't have absolute timestamps, we need to calculate the start time
    // in relation to previous clips
    const startTime = playlist
      .filter((_, i) => i < index)
      .reduce((acc, curr) => acc + (curr.end - curr.start), 0);

    if (startTime < audio.current!.duration) {
      audio.current!.currentTime = startTime;
    } else {
      const start = startTime % audio.current!.duration;
      audio.current!.currentTime = start;
      // audio.current?.pause();
    }
    audio.current!.play().catch(e => console.error('Error playing audio:', e));
  }

  const handleScroll = (event: { deltaY: any }) => {
    if (containerRef.current) {
      containerRef.current.scrollLeft += event.deltaY;
    }
  };

  if (playlist.length === 0) {
    return (
      <div>
        <h2>{$t('Preview')}</h2>
        <p>{$t('Select at least one clip to preview your video')}</p>
      </div>
    );
  }

  return (
    <div>
      <h2>{$t('Preview')}</h2>
      <p>
        This is just a preview of your highlight reel. Loading times between clips are possible.
      </p>
      <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9' }}>
        <video onClick={togglePlay} ref={videoPlayer} className={styles.videoPlayer} />
      </div>
      <div style={{ display: 'flex', marginTop: '16px', minHeight: '50px' }}>
        <div style={{ cursor: 'pointer' }} onClick={() => togglePlay()}>
          {playPauseButton()}
        </div>
        <div ref={containerRef} onWheel={handleScroll} className={styles.timeline}>
          <div className={styles.timelineItemWrapper}>
            {playlist.map(({ path }, index) => {
              let content;
              if (path === intro.path || path === outro.path) {
                content = (
                  <div
                    style={{ height: '34px', borderRadius: '6px', overflow: 'hidden' }}
                    onClick={() => {
                      jumpToClip(index);
                    }}
                  >
                    <video
                      id={'preview-' + index}
                      style={{ height: '100%' }}
                      src={path}
                      controls={false}
                      autoPlay={false}
                      muted
                      playsInline
                    ></video>
                  </div>
                );
              } else {
                content = (
                  <MiniClipPreview
                    clipId={path}
                    showDisabled={showDisabled}
                    clipStateChanged={(clipId, newState) => {
                      playlist[index].enabled = newState;
                      if (playlist[index].path === playlist[currentClipIndex].path) {
                        if (newState === true) return;
                        // If user don't want that clip and disables, jump to next clip

                        const nextEnabledClipIndex = findNextEnabledClipIndex(index);
                        jumpToClip(nextEnabledClipIndex);
                      }
                    }}
                    emitPlayClip={() => {
                      jumpToClip(index);
                    }}
                  ></MiniClipPreview>
                );
              }

              return (
                <div
                  key={'preview-mini' + index}
                  id={'preview-' + index}
                  className={styles.timelineItem}
                  style={{
                    outline: index === currentClipIndex ? '1px solid var(--teal-hover)' : 'unset',
                    outlineOffset: '-2px',
                  }}
                >
                  {content}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className={styles.actionWrapper}>
        <div className={styles.videoDurationWrapper}>
          <span>0m 0s</span>

          <span>
            {formatSecondsToHMS(
              getCombinedClipsDuration(
                // Duration is calculated when initialising the playlist
                playlist.map(clip => {
                  return {
                    duration: clip.enabled ? clip.duration : 0,
                    path: clip.path,
                    startTrim: 0,
                    endTrim: 0,
                  } as TClip;
                }),
              ),
            )}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          <CheckboxInput
            label={'Show disabled clips'}
            value={showDisabled}
            onChange={() => {
              setShowDisabled(!showDisabled);
            }}
          />
          <Button
            type="primary"
            onClick={() => {
              close();
              emitSetShowModal('export');
            }}
          >
            {$t('Export')}
          </Button>
        </div>
      </div>
    </div>
  );
}
