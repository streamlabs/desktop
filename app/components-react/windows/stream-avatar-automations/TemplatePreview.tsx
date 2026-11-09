import React, { useEffect, useState } from 'react';
import { isVideoUrl } from './automations-utils';

interface TemplatePreviewProps {
  src?: string;
  className?: string;
  muted?: boolean;
  loop?: boolean;
  onEnded?: () => void;
  // Bump this to (re)start playback from 0, even when src/muted/loop are
  // unchanged (e.g. replaying the row that matches the default preview).
  playToken?: number;
  // False holds a video on its first frame (e.g. a card's .webm "thumbnail" until hovered).
  playing?: boolean;
}

export default function TemplatePreview({
  src,
  className,
  muted = true,
  loop = true,
  onEnded,
  playToken,
  playing = true,
}: TemplatePreviewProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  // A missing file (e.g. art not uploaded yet) would show the browser's broken-image icon.
  // Show a dark placeholder of the same size instead.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = muted;
    el.loop = loop;
    el.currentTime = 0;
    if (playing) el.play().catch(() => {});
    else el.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, playToken, playing]);

  if (!src) return null;
  // Same box as the media (via className), filled with the darkest surface colour.
  if (src === failedSrc) {
    return <div className={className} style={{ background: 'var(--section)' }} aria-hidden />;
  }
  return isVideoUrl(src) ? (
    <video
      key={src}
      ref={videoRef}
      src={src}
      className={className}
      playsInline
      // Loads enough to paint the first frame while paused.
      preload="auto"
      onEnded={onEnded}
      onError={() => setFailedSrc(src)}
    />
  ) : (
    <img key={src} src={src} className={className} alt="" onError={() => setFailedSrc(src)} />
  );
}
