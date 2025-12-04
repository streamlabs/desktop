import { ExclamationCircleOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import * as remote from '@electron/remote';
import { Alert, Button, Modal, Tabs, Tooltip } from 'antd';
import { useVuex } from 'components-react/hooks';
import { Spinner } from 'components-react/pages/Loader';
import { Services } from 'components-react/service-provider';
import Display from 'components-react/shared/Display';
import UltraIcon from 'components-react/shared/UltraIcon';
import { CheckboxInput, ListInput, SliderInput, TextInput } from 'components-react/shared/inputs';
import Form from 'components-react/shared/inputs/Form';
import { ModalLayout } from 'components-react/shared/ModalLayout';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DismissablesService, EDismissable } from 'services/dismissables';
import { EDeviceType } from 'services/hardware';
import { $t } from 'services/i18n';
import { SourcesService, TSourceType } from 'services/sources';
import { ScenesService } from 'services/scenes';
import { byOS, OS } from 'util/operating-systems';
import { IGuest, GuestCamService } from 'services/guest-cam';
import {
  AudioService,
  EditorCommandsService,
  IncrementalRolloutService,
  UserService,
} from 'app-services';
import { confirmAsync } from 'components-react/modals';
import { EAvailableFeatures } from 'services/incremental-rollout';
import { initStore, useController } from '../hooks/zustand';

const GuestCamCtx = React.createContext<GuestCamController | null>(null);

class GuestCamController {
  private GuestCamService = Services.GuestCamService;
  private SourcesService = Services.SourcesService;
  private ScenesService = Services.ScenesService;
  private AudioService = Services.AudioService;
  private EditorCommandsService = Services.EditorCommandsService;
  private DismissablesService = Services.DismissablesService;
  private UserService = Services.UserService;
  private IncrementalRolloutService = Services.IncrementalRolloutService;

  store = initStore({
    regeneratingLink: false,
    hideDisplay: false,
  });

  get joinAsGuest() {
    return !!this.GuestCamService.state.joinAsGuestHash;
  }

  get hostName() {
    return this.GuestCamService.state.hostName;
  }

  get maxGuests() {
    return this.GuestCamService.state.maxGuests;
  }

  get shouldShowPrimeUpgrade() {
    return (
      this.maxGuests === 2 &&
      !this.UserService.views.isPrime &&
      !this.IncrementalRolloutService.views.featureIsEnabled(EAvailableFeatures.guestCamBeta)
    );
  }

  get showFirstTimeModal() {
    return this.DismissablesService.views.shouldShow(EDismissable.GuestCamFirstTimeModal);
  }

  get inviteUrl() {
    return this.GuestCamService.views.inviteUrl;
  }

  get produceOk() {
    return this.GuestCamService.state.produceOk;
  }

  get videoProducerSourceId() {
    return this.GuestCamService.views.videoSourceId;
  }

  get audioProducerSourceId() {
    return this.GuestCamService.views.audioSourceId;
  }

  get screenshareProducerSourceId() {
    return this.GuestCamService.views.screenshareSourceId;
  }

  get loggedIn() {
    return this.UserService.views.isLoggedIn;
  }

  get videoProducerSourceOptions() {
    const videoSourceType = byOS({ [OS.Windows]: 'dshow_input', [OS.Mac]: 'macos_avcapture' });

    return this.SourcesService.views.getSourcesByType(videoSourceType as TSourceType).map(s => ({
      label: s.name,
      value: s.sourceId,
    }));
  }

  get audioProducerSourceOptions() {
    const audioSourceType = byOS({
      [OS.Windows]: 'wasapi_input_capture',
      [OS.Mac]: 'coreaudio_input_capture',
    });

    return this.SourcesService.views.getSourcesByType(audioSourceType as TSourceType).map(s => ({
      label: s.name,
      value: s.sourceId,
    }));
  }

  get screenshareProducerSourceOptions() {
    const noSources = { label: $t('None'), value: '' };

    // TODO: consider moving to service
    const scene = this.ScenesService.views.getScene(this.ScenesService.state.activeSceneId);

    if (!scene) {
      return [noSources];
    }

    const activeSceneSources = scene.getNestedSources().filter(sceneItem => sceneItem.video);

    return [
      noSources,
      ...activeSceneSources.map(s => ({
        label: s.name,
        value: s.sourceId,
      })),
    ];
  }

  get videoProducerSource() {
    return this.GuestCamService.views.videoSource;
  }

  get audioProducerSource() {
    return this.GuestCamService.views.audioSource;
  }

  get screenshareProducerSource() {
    return this.GuestCamService.views.screenshareSource;
  }

  get availableSources() {
    const list: { label: string; value: string | null }[] = this.GuestCamService.views.sources.map(
      source => {
        const existingGuest = this.GuestCamService.views.getGuestBySourceId(source.sourceId);
        const name = existingGuest
          ? `${source.name} <${existingGuest.remoteProducer.name}>`
          : source.name;

        return {
          label: name,
          value: source.sourceId,
        };
      },
    );
    list.unshift({ label: $t('Unassigned'), value: null });

    return list;
  }

  get guests() {
    // TODO: Talk to Alex about this. Because reactivity is done via shallow
    // comparison, this won't be reactive unless it's a new array every time.
    // This seems fairly unexpected.
    return [...this.GuestCamService.state.guests];
  }

  /**
   * Because screenshares appear like a second guest, but aren't technically a second
   * guest and don't count towards a guest slot, this can be used to get simply unique
   * guests where their webcam and screenshare count as one.
   */
  get uniqueGuests() {
    const socketIds: Dictionary<boolean> = {};

    return this.GuestCamService.state.guests.filter(g => {
      if (!socketIds[g.remoteProducer.socketId]) {
        socketIds[g.remoteProducer.socketId] = true;
        return true;
      } else {
        return false;
      }
    });
  }

  get sourceExists() {
    return !!this.GuestCamService.views.sourceId;
  }

  /**
   * Fetches data needed to display a guest and functions needed to modify state
   * @param streamId The streamId of the guest
   */
  getBindingsForGuest(streamId: string) {
    const guest = this.GuestCamService.views.getGuestByStreamId(streamId);
    if (!guest?.sourceId) return;

    const source = this.SourcesService.views.getSource(guest.sourceId);
    if (!source) return;

    const volume = this.AudioService.views.getSource(source.sourceId).fader.deflection;
    const setVolume = (val: number) => {
      this.EditorCommandsService.actions.executeCommand(
        'SetDeflectionCommand',
        source.sourceId,
        val,
      );
    };

    const visible = !source.forceHidden;
    const setVisible = () => {
      this.GuestCamService.actions.setVisibility(source.sourceId, !visible);
    };

    const disconnect = () => {
      this.GuestCamService.actions.disconnectGuest(streamId, true);
    };

    const sourceId = source.sourceId;

    const markAsRead = () => {
      this.GuestCamService.actions.markGuestAsRead(streamId);
    };

    return {
      volume,
      setVolume,
      visible,
      setVisible,
      disconnect,
      sourceId,
      markAsRead,
    };
  }

  regenerateLink() {
    this.store.setState(s => {
      s.regeneratingLink = true;
    });
    this.GuestCamService.actions.return.regenerateInviteLink().finally(() =>
      this.store.setState(s => {
        s.regeneratingLink = false;
      }),
    );
  }

  truncateName(name: string, length = 10) {
    if (name.length > length) {
      return `${name.substring(0, length)}...`;
    }

    return name;
  }

  addNewSource(streamId: string) {
    this.SourcesService.actions.showAddSource('mediasoupconnector', { guestCamStreamId: streamId });
  }

  disconnectFromHost() {
    this.GuestCamService.actions.disconnectFromHost();
  }
}

export default function GuestCamProperties() {
  const controller = useMemo(() => new GuestCamController(), []);

  return (
    <GuestCamCtx.Provider value={controller}>
      <GuestCamPropertiesModal />
    </GuestCamCtx.Provider>
  );
}

function GuestCamPropertiesModal() {
  const {
    GuestCamService,
    SourcesService,
    WindowsService,
    EditorCommandsService,
    DismissablesService,
    MagicLinkService,
  } = Services;
  const defaultTab = useMemo(() => {
    const openedSourceId = WindowsService.getChildWindowQueryParams().sourceId;
    const guest = GuestCamService.views.getGuestBySourceId(openedSourceId);

    if (!guest) return 'settings';

    return guest.remoteProducer.streamId;
  }, []);
  const controller = useController(GuestCamCtx);
  const { regenerateLink, truncateName, disconnectFromHost } = controller;
  const regeneratingLink = controller.store.useState(s => s.regeneratingLink);
  const {
    guests,
    uniqueGuests,
    maxGuests,
    shouldShowPrimeUpgrade,
    joinAsGuest,
    hostName,
    showFirstTimeModal,
    inviteUrl,
    videoProducerSource,
    videoProducerSourceId,
    videoProducerSourceOptions,
    audioProducerSource,
    audioProducerSourceId,
    audioProducerSourceOptions,
    screenshareProducerSourceId,
    screenshareProducerSourceOptions,
    sourceExists,
    produceOk,
    loggedIn,
  } = useVuex(() => ({
    guests: controller.guests,
    uniqueGuests: controller.uniqueGuests,
    maxGuests: controller.maxGuests,
    shouldShowPrimeUpgrade: controller.shouldShowPrimeUpgrade,
    joinAsGuest: controller.joinAsGuest,
    hostName: controller.hostName,
    showFirstTimeModal: controller.showFirstTimeModal,
    inviteUrl: controller.inviteUrl,
    videoProducerSource: controller.videoProducerSource,
    videoProducerSourceId: controller.videoProducerSourceId,
    videoProducerSourceOptions: controller.videoProducerSourceOptions,
    audioProducerSource: controller.audioProducerSource,
    audioProducerSourceId: controller.audioProducerSourceId,
    audioProducerSourceOptions: controller.audioProducerSourceOptions,
    screenshareProducerSourceId: controller.screenshareProducerSourceId,
    screenshareProducerSourceOptions: controller.screenshareProducerSourceOptions,
    sourceExists: controller.sourceExists,
    produceOk: controller.produceOk,
    loggedIn: controller.loggedIn,
  }));

  function getModalContent() {
    if (showFirstTimeModal) {
      return <FirstTimeModalContent />;
    } else if (!sourceExists) {
      return <MissingSourceModalContent />;
    } else if (joinAsGuest) {
      return <JoinAsGuestModalContent />;
    } else {
      return <EveryTimeModalContent />;
    }
  }

  function getModalButtonText() {
    if (showFirstTimeModal) {
      return $t('Get Started');
    } else if (!sourceExists) {
      return $t('Add Source');
    } else {
      return $t('Start Collab Cam');
    }
  }

  function getGuestLabel(guest: IGuest) {
    const name = truncateName(guest.remoteProducer.name);
    const icon = guest.remoteProducer.type === 'screenshare' ? 'fa-desktop' : 'fa-user';

    return (
      <span>
        <i className={`fa ${icon}`} style={{ marginRight: 8 }} />
        {name}
      </span>
    );
  }

  if (!loggedIn) {
    return (
      <ModalLayout>
        <Alert
          type="error"
          showIcon={true}
          closable={false}
          message={<div>{$t('You must be logged in to use Collab Cam.')}</div>}
        />
      </ModalLayout>
    );
  }

  return (
    <ModalLayout scrollable>
      <Tabs destroyInactiveTabPane={true} defaultActiveKey={defaultTab}>
        <Tabs.TabPane tab={$t('Settings')} key="settings">
          <Form layout="inline">
            {joinAsGuest ? (
              <div style={{ height: 32, margin: '10px 0 10px' }}>
                <div>
                  <b>{$t('Connected To Host:')}</b>{' '}
                  <span style={{ color: 'var(--title)' }}>{hostName}</span>
                  <Tooltip
                    title={$t(
                      "You are connected as a guest using someone else's invite link. To leave, click the Disconnect button.",
                    )}
                  >
                    <QuestionCircleOutlined style={{ marginLeft: 6 }} />
                  </Tooltip>
                  <button
                    style={{ marginLeft: 10 }}
                    className="button button--soft-warning"
                    onClick={disconnectFromHost}
                  >
                    {$t('Disconnect')}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', width: '100%', margin: '10px 0' }}>
                <TextInput
                  readOnly
                  value={inviteUrl}
                  label={$t('Invite URL')}
                  style={{ flexGrow: 1 }}
                  addonAfter={
                    <Tooltip trigger="click" title={$t('Copied!')}>
                      <Button onClick={() => remote.clipboard.writeText(inviteUrl)}>
                        {$t('Copy')}
                      </Button>
                    </Tooltip>
                  }
                />
                <Button disabled={regeneratingLink} onClick={regenerateLink} style={{ width: 180 }}>
                  {$t('Generate a new link')}
                  {regeneratingLink && (
                    <i className="fa fa-spinner fa-pulse" style={{ marginLeft: 8 }} />
                  )}
                </Button>
              </div>
            )}
            {!joinAsGuest && (
              <div style={{ margin: '10px 0 0', width: '100%' }}>
                <span>{$t('Guests')}</span>
                <span
                  style={{
                    marginLeft: 8,
                    background: 'var(--section-alt)',
                    padding: 5,
                    borderRadius: 6,
                  }}
                >
                  {uniqueGuests.length} / {maxGuests - 1}
                </span>
                {shouldShowPrimeUpgrade && (
                  <span
                    style={{ marginLeft: 8, cursor: 'pointer' }}
                    onClick={() => MagicLinkService.actions.linkToPrime('desktop-collab-cam')}
                  >
                    <UltraIcon
                      style={{
                        display: 'inline-block',
                        height: '12px',
                        width: '12px',
                      }}
                    />
                    <b style={{ marginLeft: 5 }}>{$t('Upgrade for more Guests')}</b>
                  </span>
                )}
              </div>
            )}
            <h2 style={{ marginTop: 20 }}>
              {$t(
                'The webcam and microphone source you select below will be broadcast to your guests.',
              )}
            </h2>
            <div
              style={{
                display: 'flex',
                width: '100%',
                margin: '10px 0',
                justifyContent: 'space-between',
              }}
            >
              <ListInput
                label={$t('Webcam Source')}
                options={videoProducerSourceOptions}
                value={videoProducerSourceId}
                onChange={s => GuestCamService.actions.setVideoSource(s)}
                style={{ width: '48%', margin: 0 }}
              />
              <ListInput
                label={$t('Microphone Source')}
                options={audioProducerSourceOptions}
                value={audioProducerSourceId}
                onChange={s => GuestCamService.actions.setAudioSource(s)}
                style={{ width: '48%', margin: 0 }}
              />
            </div>
            <div
              style={{
                display: 'flex',
                width: '100%',
                margin: '10px 0',
              }}
            >
              <ListInput
                label={$t('Share Video Source (Optional)')}
                options={screenshareProducerSourceOptions}
                value={screenshareProducerSourceId}
                onChange={s => GuestCamService.actions.setScreenshareSource(s)}
                style={{ width: '48%', margin: 0 }}
              />
              {screenshareProducerSourceId && (
                <button
                  className="button button--soft-warning"
                  onClick={() => GuestCamService.actions.setScreenshareSource('')}
                  style={{ marginLeft: 30 }}
                >
                  {$t('Stop Sharing')}
                </button>
              )}
            </div>
          </Form>
          {(!videoProducerSource || !audioProducerSource) && (
            <Alert
              type="error"
              showIcon={true}
              closable={false}
              message={
                <div style={{ color: 'var(--paragraph)' }}>
                  {!videoProducerSource && (
                    <div>
                      {$t('No webcam source is selected. Your guest will not be able to see you.')}
                    </div>
                  )}
                  {!audioProducerSource && (
                    <div>
                      {$t(
                        'No microphone source is selected. Your guest will not be able to hear you.',
                      )}
                    </div>
                  )}
                </div>
              }
            />
          )}
        </Tabs.TabPane>
        {guests.map(guest => {
          return (
            <Tabs.TabPane tab={getGuestLabel(guest)} key={guest.remoteProducer.streamId}>
              <GuestPane guest={guest} />
            </Tabs.TabPane>
          );
        })}
      </Tabs>
      <Modal
        visible={!produceOk}
        getContainer={false}
        closable={false}
        okText={getModalButtonText()}
        onOk={() => {
          if (sourceExists) {
            GuestCamService.actions.setProduceOk();
          } else if (!showFirstTimeModal) {
            SourcesService.actions.showAddSource('mediasoupconnector');
          }

          DismissablesService.actions.dismiss(EDismissable.GuestCamFirstTimeModal);
        }}
        onCancel={() => WindowsService.actions.closeChildWindow()}
      >
        {getModalContent()}
      </Modal>
    </ModalLayout>
  );
}

function GuestSourceSelector(p: { guest: IGuest; style?: React.CSSProperties }) {
  const controller = useController(GuestCamCtx);
  const { getBindingsForGuest, store } = controller;
  const availableSources = useVuex(() => controller.availableSources);
  const bindings = useVuex(() => getBindingsForGuest(p.guest.remoteProducer.streamId));
  const sourceId = bindings ? bindings.sourceId : null;
  const { GuestCamService, SourcesService } = Services;

  const setHideDisplay = useCallback((isHidden: boolean) => {
    store.setState(s => {
      s.hideDisplay = isHidden;
    });
  }, []);

  async function setSourceId(sourceId?: string) {
    if (!sourceId) {
      setHideDisplay(true);
      const confirmed = await confirmAsync(
        $t('Are you sure you want to unassign %{guestName} from the source?', {
          guestName: p.guest.remoteProducer.name,
        }),
      );
      setHideDisplay(false);

      if (!confirmed) return;

      GuestCamService.actions.setGuestSource(p.guest.remoteProducer.streamId, null);
      return;
    }

    const existingGuest = GuestCamService.views.getGuestBySourceId(sourceId);

    if (existingGuest) {
      const source = SourcesService.views.getSource(sourceId)!;
      setHideDisplay(true);
      const confirmed = await confirmAsync(
        $t(
          'The source %{sourceName} is already occupied by %{guestName}. If you continue, %{guestName} will be unassigned.',
          { sourceName: source.name, guestName: existingGuest.remoteProducer.name },
        ),
      );
      setHideDisplay(false);

      if (!confirmed) return;
    }

    GuestCamService.actions.setGuestSource(p.guest.remoteProducer.streamId, sourceId);
  }

  return (
    <ListInput
      options={availableSources}
      value={sourceId}
      label={$t('Assign to Source')}
      listHeight={120}
      onChange={setSourceId}
      style={p.style}
    />
  );
}

function DisconnectModal(p: { setCheckboxVal: (val: boolean) => void }) {
  const [regen, setRegen] = useState(true);

  return (
    <>
      <p>
        {$t(
          'If you want to prevent this guest from rejoining, you should also regenerate your invite link.',
        )}
      </p>
      <Form>
        <CheckboxInput
          label={$t('Regenerate Link')}
          value={regen}
          onChange={(val: boolean) => {
            setRegen(val);
            p.setCheckboxVal(val);
          }}
        />
      </Form>
    </>
  );
}

function GuestPane(p: { guest: IGuest }) {
  const { getBindingsForGuest, addNewSource, regenerateLink, store } = useController(GuestCamCtx);
  const setHideDisplay = useCallback((isHidden: boolean) => {
    store.setState(s => {
      s.hideDisplay = isHidden;
    });
  }, []);

  // TODO: Talk to Alex about how the useModule pattern thinks this should
  // be handled with reactivity. For now, wrap in useVuex to make it reactive.
  const bindings = useVuex(() => getBindingsForGuest(p.guest.remoteProducer.streamId));

  useEffect(() => {
    if (bindings) bindings.markAsRead();
  }, []);

  if (!bindings) {
    return (
      <div>
        <h2>{$t('This guest is not assigned to a source')}</h2>
        <Form layout="inline">
          <GuestSourceSelector guest={p.guest} style={{ width: 400 }} />
          <Button onClick={() => addNewSource(p.guest.remoteProducer.streamId)}>
            {$t('Add New Source')}
          </Button>
        </Form>
      </div>
    );
  }

  const { visible, setVisible, volume, setVolume, disconnect } = bindings;

  async function onDisconnectClick() {
    let regen = true;
    setHideDisplay(true);
    const confirmed = await confirmAsync({
      title: $t('Are you sure you want to disconnect %{guestName}?', {
        guestName: p.guest.remoteProducer.name,
      }),
      content: <DisconnectModal setCheckboxVal={val => (regen = val)} />,
    });
    setHideDisplay(false);

    if (!confirmed) return;

    if (regen) {
      regenerateLink();
    }

    disconnect();
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--section-alt)',
        borderRadius: 8,
      }}
    >
      <GuestDisplay guest={p.guest} />
      <div style={{ flexGrow: 1, padding: 20 }}>
        <Form layout="inline">
          <div style={{ display: 'flex', flexDirection: 'row', width: '100%' }}>
            <div style={{ width: 400, margin: '0 20px 20px' }}>
              <GuestSourceSelector guest={p.guest} />
            </div>
            <div style={{ flexGrow: 1, margin: '0 20px 20px' }}>
              <SliderInput
                label={$t('Volume')}
                value={volume}
                onChange={setVolume}
                min={0}
                max={1}
                debounce={500}
                step={0.01}
                tipFormatter={v => `${(v * 100).toFixed(0)}%`}
                tooltipPlacement="bottom"
                style={{ width: '100%' }}
              />
            </div>
          </div>
          <div style={{ width: '100%', marginLeft: 20 }}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'center',
                margin: '20px 0',
              }}
            >
              <Button
                onClick={setVisible}
                style={{ width: 160, marginRight: 40 }}
                type={!visible ? 'primary' : 'default'}
              >
                {visible ? $t('Hide on Stream') : $t('Show on Stream')}
              </Button>
              <button
                className="button button--soft-warning"
                style={{ width: 160 }}
                onClick={onDisconnectClick}
              >
                {$t('Disconnect')}
              </button>
            </div>
          </div>
        </Form>
      </div>
    </div>
  );
}

function GuestDisplay(p: { guest: IGuest }) {
  const { produceOk, getBindingsForGuest, store } = useController(GuestCamCtx);
  const hideDisplay = store.useState(s => s.hideDisplay);
  const bindings = useVuex(() => getBindingsForGuest(p.guest.remoteProducer.streamId));

  if (!bindings) return <div></div>;

  const { sourceId } = bindings;

  return (
    <div style={{ background: 'var(--section)', borderRadius: '8px 8px 0 0', height: 280 }}>
      {/* Weird double div is to avoid display blocking border radius */}
      <div style={{ margin: '0 10px', width: 'calc(100% - 20px)', height: '100%' }}>
        {produceOk && !hideDisplay && <Display sourceId={sourceId} />}
      </div>
    </div>
  );
}

function EveryTimeModalContent() {
  return (
    <h2 style={{ textAlign: 'center' }}>
      {$t('Collab Cam is not yet sending your video and audio to guests. Start Collab Cam?')}
    </h2>
  );
}

function FirstTimeModalContent() {
  return (
    <>
      <h2>{$t('Welcome to Collab Cam')}</h2>
      <h3>{$t('Step 1')}</h3>
      <p>
        {$t(
          "Copy and share a link with your guest. When they join, they'll be able to see and hear you.",
        )}
      </p>
      <h3>{$t('Step 2')}</h3>
      <p>
        {$t(
          "Verify their identity in the preview area. When ready, add them to your stream by clicking 'Show on Stream'.",
        )}
      </p>
      <h3>{$t('Step 3')}</h3>
      <p>
        {$t(
          'Enjoy your stream! Adjust their volume, create new links, and change your mic and camera from the properties window.',
        )}
      </p>
      <Alert
        message={
          <div style={{ color: 'var(--info)' }}>
            <ExclamationCircleOutlined style={{ color: 'var(--info)', marginRight: 8 }} />
            {$t(
              "Don't share your invite link with anyone you don't want on your stream. You can invalidate an old link by generating a new one. Do not show this window on stream.",
            )}
          </div>
        }
        type="info"
        closable={false}
        showIcon={false}
        banner
      />
      <a
        style={{ display: 'inline-block', marginTop: 10 }}
        onClick={() => remote.shell.openExternal('https://streamlabs.com/collab-cam')}
      >
        {$t('Learn More')}
      </a>
    </>
  );
}

function JoinAsGuestModalContent() {
  const { GuestCamService } = Services;
  const { hostName } = useVuex(() => ({ hostName: GuestCamService.state.hostName }));

  return (
    <>
      <h2>{$t("You're about to join %{name}", { name: hostName })}</h2>
      <p>
        {$t(
          "%{name} has invited you to join their stream. When you're ready to join, click the button below.",
          { name: hostName },
        )}
      </p>
    </>
  );
}

function MissingSourceModalContent() {
  return (
    <>
      <h2>{$t('Collab Cam requires a source')}</h2>
      <p>
        {$t(
          'At least one Collab Cam source is required to use Collab Cam. Would you like to add one now?',
        )}
      </p>
    </>
  );
}
