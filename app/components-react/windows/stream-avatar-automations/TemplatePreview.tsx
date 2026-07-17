import React, { useEffect } from 'react';
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
}

export default function TemplatePreview({
  src,
  className,
  muted = true,
  loop = true,
  onEnded,
  playToken,
}: TemplatePreviewProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = muted;
    el.loop = loop;
    el.currentTime = 0;
    el.play().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, playToken]);

  if (!src) return null;
  return isVideoUrl(src) ? (
    <video key={src} ref={videoRef} src={src} className={className} playsInline onEnded={onEnded} />
  ) : (
    <img key={src} src={src} className={className} />
  );
}
