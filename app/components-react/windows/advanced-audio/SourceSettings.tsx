import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Button, Collapse, Tooltip } from 'antd';
import {
  SliderInput,
  BoolButtonInput,
  ListInput,
  SwitchInput,
  NumberInput,
} from 'components-react/shared/inputs';
import InputWrapper from 'components-react/shared/inputs/InputWrapper';
import Form from 'components-react/shared/inputs/Form';
import { TObsValue, IObsListInput, TObsFormData } from 'components/obs/inputs/ObsInput';
import { Services } from 'components-react/service-provider';
import { useChildWindowParams, useVuex } from 'components-react/hooks';
import { AudioSource } from 'services/audio';
import { Source } from 'services/sources';
import { $t } from 'services/i18n';
import Utils from 'services/utils';
import styles from './AdvancedAudio.m.less';

const { Panel } = Collapse;

export default function AdvancedAudio() {
  const { AudioService, WindowsService } = Services;

  const initialSource = useChildWindowParams('sourceId') || '';
  const [expandedSource, setExpandedSource] = useState(initialSource);

  const { audioSources } = useVuex(() => ({
    audioSources: AudioService.views.sourcesForCurrentScene,
  }));

  return (
    <Collapse
      accordion
      activeKey={expandedSource}
      onChange={(key: string) => setExpandedSource(key)}
    >
      {audioSources.map(audioSource => (
        <Panel key={audioSource.sourceId} header={<PanelHeader source={audioSource} />}>
          <PanelForm source={audioSource} />
        </Panel>
      ))}
    </Collapse>
  );
}

function PanelHeader(p: { source: AudioSource }) {
  const { EditorCommandsService, SettingsService } = Services;

  const {
    isAdvancedOutput,
    recordingTracks,
    streamTrack,
    vodTrackEnabled,
    vodTrack,
    muted,
  } = useVuex(() => ({
    isAdvancedOutput: SettingsService.views.isAdvancedOutput,
    streamTrack: SettingsService.views.streamTrack,
    recordingTracks: SettingsService.views.recordingTracks,
    vodTrackEnabled: SettingsService.views.vodTrackEnabled,
    vodTrack: SettingsService.views.vodTrack,
    // Hack to make muted property reactive
    muted: p.source.muted,
  }));

  const { name, mixerHidden, fader, audioMixers, sourceId } = p.source;

  const [trackFlags, setTrackFlags] = useState(
    Utils.numberToBinnaryArray(audioMixers, 6).reverse(),
  );

  function onTrackInput(index: number, value: boolean) {
    const newArray = [...trackFlags];
    newArray[index] = Number(value);
    setTrackFlags(newArray);
    const newValue = Utils.binnaryArrayToNumber([...newArray].reverse());
    EditorCommandsService.actions.executeCommand('SetAudioSettingsCommand', sourceId, {
      audioMixers: newValue,
    });
  }

  function onDeflectionInput(value: number) {
    EditorCommandsService.actions.executeCommand(
      'SetDeflectionCommand',
      sourceId,
      (value as number) / 100,
    );
  }

  function onInputHandler(name: string, value: TObsValue, e: React.MouseEvent) {
    e.stopPropagation();
    EditorCommandsService.actions.executeCommand('SetAudioSettingsCommand', sourceId, {
      [name]: value,
    });
  }

  return (
    <Form className={styles.audioSettingsRow} data-role="form" data-name="advanced-audio-header">
      <div className={styles.audioSourceName}>{name}</div>
      <Tooltip title={muted ? $t('Unmute') : $t('Mute')}>
        <i
          className={muted ? 'icon-mute' : 'icon-audio'}
          onClick={(e: React.MouseEvent) => onInputHandler('muted', !muted, e)}
        />
      </Tooltip>
      <div
        style={{ width: '200px', flexShrink: 0 }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <SliderInput
          value={Math.floor(fader.deflection * 100)}
          max={100}
          min={0}
          name="deflection"
          onInput={onDeflectionInput}
          hasNumberInput
          slimNumberInput
          nowrap
        />
      </div>
      <Tooltip title={mixerHidden ? $t('Show in Mixer') : $t('Hide in Mixer')}>
        <i
          className={mixerHidden ? 'icon-hide' : 'icon-view'}
          onClick={(e: React.MouseEvent) => onInputHandler('mixerHidden', !mixerHidden, e)}
        />
      </Tooltip>
      {(isAdvancedOutput || vodTrackEnabled) && (
        <div
          className={styles.audioSettingsTracks}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        >
          {(isAdvancedOutput || vodTrackEnabled) && (
            <InputWrapper
              label={vodTrackEnabled ? $t('Stream Tracks') : $t('Stream Track')}
              tooltip={$t('Designates if this source is audible in your live broadcast')}
              layout="horizontal"
              style={{ flexWrap: 'nowrap' }}
            >
              <div style={{ display: 'flex' }}>
                <BoolButtonInput
                  label={String(streamTrack + 1)}
                  value={!!trackFlags[streamTrack]}
                  onChange={value => onTrackInput(streamTrack, value)}
                  checkboxStyles={{ marginRight: vodTrackEnabled ? '4px' : '8px' }}
                  name="streamTrack"
                />
                {vodTrackEnabled && (
                  <BoolButtonInput
                    label={String(vodTrack + 1)}
                    value={!!trackFlags[vodTrack]}
                    onChange={value => onTrackInput(vodTrack, value)}
                    checkboxStyles={{ marginRight: '8px' }}
                    name="vodTrack"
                  />
                )}
              </div>
            </InputWrapper>
          )}
          {isAdvancedOutput && (
            <InputWrapper
              label={$t('Rec. Tracks')}
              tooltip={$t('Designates if this source is audible in your recorded track(s)')}
              layout="horizontal"
              style={{ flexWrap: 'nowrap' }}
            >
              <div style={{ display: 'flex' }}>
                {recordingTracks?.map(track => (
                  <BoolButtonInput
                    label={String(track + 1)}
                    key={track}
                    value={!!trackFlags[track]}
                    onChange={value => onTrackInput(track, value)}
                    checkboxStyles={{ marginRight: '4px' }}
                    name={`flag${track}`}
                  />
                ))}
              </div>
            </InputWrapper>
          )}
        </div>
      )}
    </Form>
  );
}

function PanelForm(p: { source: AudioSource }) {
  const { sourceId, forceMono, syncOffset, source, monitoringType } = p.source;

  const [testing, setTesting] = useState(false);
  const savedMonitoring = useRef(monitoringType);

  const hasDevices = !source?.video && !(source?.type === 'soundtrack_source');
  const isMic = source
    ? [
        'wasapi_input_capture',
        'coreaudio_input_capture',
        'dshow_input',
        'av_capture_input',
      ].includes(source.type)
    : false;

  const isProcessCapture = source?.type === 'wasapi_process_output_capture';

  const { EditorCommandsService } = Services;

  function handleSettingsChange(name: string, value: TObsValue) {
    EditorCommandsService.actions.executeCommand('SetAudioSettingsCommand', sourceId, {
      [name]: value,
    });
  }

  useEffect(() => {
    if (testing) return;
    savedMonitoring.current = monitoringType;
  }, [monitoringType, testing]);
  useEffect(() => {
    // Ensure monitoring type is returned to normal upon destroy
    return () => {
      if (p.source.isDestroyed()) return;

      p.source.setSettings({ monitoringType: savedMonitoring.current });
    };
  }, []);

  function handleTestButtonClick() {
    if (!testing) {
      setTesting(true);
      p.source.setSettings({ monitoringType: 1 });
    } else {
      p.source.setSettings({ monitoringType: savedMonitoring.current });
      setTesting(false);
    }
  }

  return (
    <Form data-role="form" data-name="advanced-audio-detail">
      {hasDevices && source && <DeviceInputs source={source} />}
      <NumberInput
        label={$t('Sync Offset')}
        value={syncOffset}
        name="syncOffset"
        onChange={value => handleSettingsChange('syncOffset', value)}
        tooltip={$t('Time it takes between sound occuring and being broadcast (ms)')}
        min={-950}
        max={5000}
        uncontrolled={false}
      />
      {!isProcessCapture && <SwitchInput
        label={$t('Downmix to Mono')}
        value={forceMono}
        name="forceMono"
        onChange={value => handleSettingsChange('forceMono', value)}
        tooltip={$t('Route audio to the central channel instead of left or right stereo channels')}
      />}
      <ListInput
        label={$t('Audio Monitoring')}
        options={p.source.monitoringOptions}
        value={monitoringType}
        disabled={testing}
        name="monitoringType"
        onChange={value => handleSettingsChange('monitoringType', value)}
        tooltip={$t(
          'Generally, enabling monitoring sends the audio through the Desktop Audio channel',
        )}
      />
      {isMic && (
        <Button
          onClick={handleTestButtonClick}
          type={testing ? 'default' : 'primary'}
          style={{ marginLeft: '278px' }}
        >
          {testing ? $t('Testing...') : $t('Test Audio')}
        </Button>
      )}
    </Form>
  );
}

function DeviceInputs(p: { source: Source }) {
  const { EditorCommandsService } = Services;

  const sourceProperties = useMemo<TObsFormData>(() => p.source.getPropertiesFormData(), [
    p.source.sourceId,
  ]);
  const settings = useMemo(() => p.source.getSettings(), [p.source.sourceId]);
  const [statefulSettings, setStatefulSettings] = useState(settings);

  const deviceOptions = (sourceProperties[0] as IObsListInput<TObsValue>).options.map(option => ({
    label: option.description,
    value: option.value,
  }));

  function handleInput(name: string, value: TObsValue) {
    EditorCommandsService.actions.executeCommand('EditSourceSettingsCommand', p.source.sourceId, {
      [name]: value,
    });
    setStatefulSettings({ ...statefulSettings, [name]: value });
  }
  const isOutputCapture: boolean = p.source.type === 'wasapi_process_output_capture';
  const settingId = isOutputCapture ? statefulSettings.window : statefulSettings.device_id;
  const inputField = isOutputCapture ? 'window' : 'device_id';
  const inputLabel = isOutputCapture ? 'Window' : 'Device';
  const foundDevice: boolean = deviceOptions.some(option => option.value === settingId);

  // Ensure the input is still valid. If not, reset to Default device which should be at index 0.
  const inputId =
    foundDevice || deviceOptions.length === 0 ? settingId : deviceOptions[0].value;
  if (!foundDevice && deviceOptions.length > 0) {
    handleInput(inputField, deviceOptions[0].value);
  }

  return (
    <>
      {
        <ListInput
          label={inputLabel}
          options={deviceOptions}
          value={inputId}
          onChange={value => handleInput(inputField, value)}
        />
      }
      {!isOutputCapture && <SwitchInput
        label={$t('Use Device Timestamps')}
        value={statefulSettings.use_device_timing}
        onChange={value => handleInput('use_device_timing', value)}
      />}
    </>
  );
}
