import React from 'react';
import Form from 'components-react/shared/inputs/Form';
import { SliderInput, FileInput, SwitchInput } from 'components-react/shared/inputs';
import { Button } from 'antd';
import path from 'path';
import Scrollable from 'components-react/shared/Scrollable';
import Animate from 'rc-animate';
import TransitionSelector from 'components-react/highlighter/TransitionSelector';
import { $t } from 'services/i18n';
import { TModalClipsView } from './ClipsView';
import { useVuex } from 'components-react/hooks';
import { Services } from 'components-react/service-provider';
import { SUPPORTED_FILE_TYPES } from 'services/highlighter/constants';
import { RenderingClip } from 'services/highlighter/rendering/rendering-clip';

export function EditingControls({
  emitSetShowModal,
}: {
  emitSetShowModal: (modal: TModalClipsView | null) => void;
}) {
  const { HighlighterService } = Services;

  const v = useVuex(() => ({
    transition: HighlighterService.views.transition,
    audio: HighlighterService.views.audio,
    video: HighlighterService.views.video,
    error: HighlighterService.views.error,
  }));

  function setTransitionDuration(duration: number) {
    HighlighterService.actions.setTransition({ duration });
  }

  function setMusicEnabled(enabled: boolean) {
    HighlighterService.actions.setAudio({ musicEnabled: enabled });
  }

  const musicExtensions = ['mp3', 'wav', 'flac'];
  const videoExtensions = SUPPORTED_FILE_TYPES;

  function setMusicFile(file: string) {
    if (!musicExtensions.map(e => `.${e}`).includes(path.parse(file).ext)) return;
    HighlighterService.actions.setAudio({ musicPath: file });
  }

  async function setVideoFile(file: string, type: 'intro' | 'outro') {
    if (!videoExtensions.map(e => `.${e}`).includes(path.parse(file).ext)) return;
    const tempClip = new RenderingClip(file);
    await tempClip.init();
    HighlighterService.actions.setVideo({ [type]: { path: file, duration: tempClip.duration } });
  }
  function removeVideoFile(type: 'intro' | 'outro') {
    HighlighterService.actions.setVideo({ [type]: { path: '', duration: null } });
  }

  function setMusicVolume(volume: number) {
    HighlighterService.actions.setAudio({ musicVolume: volume });
  }

  return (
    <Scrollable
      style={{
        width: '300px',
        flexShrink: 0,
        background: 'var(--section)',
        borderLeft: '1px solid var(--border)',
        padding: '20px',
      }}
    >
      <Form layout="vertical">
        <TransitionSelector />
        <SliderInput
          label={$t('Transition Duration')}
          value={v.transition.duration}
          onChange={setTransitionDuration}
          min={0.5}
          max={5}
          step={0.1}
          debounce={200}
          hasNumberInput={false}
          tooltipPlacement="top"
          tipFormatter={v => `${v}s`}
        />

        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <FileInput
            style={{ width: '100%' }}
            label={$t('Intro')}
            value={v.video.intro.path}
            filters={[{ name: 'Video file', extensions: videoExtensions }]}
            onChange={e => {
              setVideoFile(e, 'intro');
            }}
          />
          {v.video.intro.path && (
            <div style={{ marginBottom: '24px', marginLeft: '4px' }}>
              <Button
                type="ghost"
                onClick={() => removeVideoFile('intro')}
                icon={<span style={{ color: '#ffffff', fontSize: '20px' }}>&times;</span>}
              />
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <FileInput
            style={{ width: '100%' }}
            label={$t('Outro')}
            value={v.video.outro.path}
            filters={[{ name: 'Video file', extensions: videoExtensions }]}
            onChange={e => {
              setVideoFile(e, 'outro');
            }}
          />
          {v.video.outro.path && (
            <div style={{ marginBottom: '24px', marginLeft: '4px' }}>
              <Button
                type="ghost"
                onClick={() => removeVideoFile('outro')}
                icon={<span style={{ color: '#ffffff', fontSize: '20px' }}>&times;</span>}
              />
            </div>
          )}
        </div>
        <SwitchInput
          label={$t('Background Music')}
          value={v.audio.musicEnabled}
          onChange={setMusicEnabled}
        />
        <Animate transitionName="ant-slide-up">
          {v.audio.musicEnabled && (
            <div>
              <FileInput
                label={$t('Music File')}
                value={v.audio.musicPath}
                filters={[{ name: $t('Audio File'), extensions: musicExtensions }]}
                onChange={setMusicFile}
              />
              <SliderInput
                label={$t('Music Volume')}
                value={v.audio.musicVolume}
                onChange={setMusicVolume}
                min={0}
                max={100}
                step={1}
                debounce={200}
                hasNumberInput={false}
                tooltipPlacement="top"
                tipFormatter={v => `${v}%`}
              />
            </div>
          )}
        </Animate>
      </Form>
    </Scrollable>
  );
}
