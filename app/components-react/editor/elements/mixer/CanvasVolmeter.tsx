import React, { useEffect, useRef, useState } from 'react';
import { Services } from 'components-react/service-provider';
import { Volmeter2d } from 'services/audio/volmeter-2d';
import { useVuex } from 'components-react/hooks';

export default function MixerVolmeter(p: { audioSourceId: string; volmetersEnabled: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const spacer = useRef<HTMLDivElement>(null);
  const { AudioService, SettingsService } = Services;

  const [renderingInitialized, setRenderingInitialized] = useState(false);

  // When the global audio channel setup changes (e.g. Stereo ↔ 5.1), browser sources
  // may keep reporting the old channel count for a while because their audio pipeline
  // is asynchronous. PATCH_SETTINGS replaces state.Audio with a new object reference
  // each time audio settings are saved, so watching it here causes the Volmeter2d to
  // be destroyed and recreated — resetting the bar count to the correct default.
  const { audioSettings } = useVuex(() => ({
    audioSettings: SettingsService.state.Audio,
  }));

  useEffect(() => {
    if (!spacer.current || !canvas.current) return;
    setRenderingInitialized(false);
    const source = AudioService.views.getSource(p.audioSourceId);
    const volmeterRenderer = new Volmeter2d(
      source,
      canvas.current,
      spacer.current,
      () => setRenderingInitialized(true),
      p.volmetersEnabled,
    );

    return () => {
      if (volmeterRenderer) volmeterRenderer.destroy();
    };
  }, [canvas.current, spacer.current, audioSettings]);

  return (
    <div className="volmeter-container">
      {renderingInitialized && (
        <canvas
          style={{ position: 'absolute', overflow: 'hidden', backgroundColor: 'var(--border)' }}
          ref={canvas}
        />
      )}
      <div style={{ margin: '10px 0' }} ref={spacer} />
    </div>
  );
}
