import { useVuex } from 'components-react/hooks';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import styles from './StudioEditor.m.less';
import { Services } from 'components-react/service-provider';
import cx from 'classnames';
import Display from 'components-react/shared/Display';
import { $t } from 'services/i18n';
import { ERenderingMode } from '../../../obs-api';
import { TDisplayType } from 'services/settings-v2';
import AutoProgressBar from 'components-react/shared/AutoProgressBar';
import { useSubscription } from 'components-react/hooks/useSubscription';
import { message } from 'antd';
import { useRealmObject } from 'components-react/hooks/realm';
import { ENotificationType } from 'services/notifications';
import { Service } from 'services/core/service';
import { AudioNotificationType } from 'services/audio/audio';
import { EAvailableFeatures } from 'services/incremental-rollout';

export default function StudioEditor() {
  const {
    WindowsService,
    CustomizationService,
    EditorService,
    TransitionsService,
    ScenesService,
    DualOutputService,
    StreamingService,
    AudioService,
    NotificationsService,
    JsonrpcService,
    DefaultHardwareService,
  } = Services;
  const performanceMode = useRealmObject(CustomizationService.state).performanceMode;
  const v = useVuex(() => ({
    cursor: EditorService.state.cursor,
    studioMode: TransitionsService.state.studioMode,
    dualOutputMode: DualOutputService.views.dualOutputMode,
    showHorizontalDisplay: DualOutputService.views.showHorizontalDisplay,
    showVerticalDisplay:
      DualOutputService.views.showVerticalDisplay && !StreamingService.state.selectiveRecording,
    isRecording: StreamingService.views.isRecording,
    activeSceneId: ScenesService.views.activeSceneId,
    isLoading: DualOutputService.views.isLoading,
  }));
  const displayEnabled = !performanceMode && !v.isLoading;
  const placeholderRef = useRef<HTMLDivElement>(null);
  const studioModeRef = useRef<HTMLDivElement>(null);
  const [studioModeStacked, setStudioModeStacked] = useState(false);
  const [verticalPlaceholder, setVerticalPlaceholder] = useState(false);
  const [messageActive, setMessageActive] = useState(false);
  const studioModeTransitionName = useMemo(() => TransitionsService.getStudioTransitionName(), [
    v.studioMode,
  ]);

  const sourceId = useMemo(() => {
    const dualOutputMode = v.showHorizontalDisplay && v.showVerticalDisplay;
    return v.studioMode && !dualOutputMode ? studioModeTransitionName : undefined;
  }, [v.showHorizontalDisplay, v.showVerticalDisplay, v.studioMode]);

  useEffect(() => {
    const timeoutHandles: { [key: number]: NodeJS.Timeout | undefined } = {};

    const subscription = AudioService.audioNotificationUpdated.subscribe(notificationType => {
      if (timeoutHandles[notificationType]) return;
      if (!StreamingService.views.isStreaming && !StreamingService.views.isRecording) return;
      if (!DefaultHardwareService.state.enableMuteNotifications) return;

      timeoutHandles[notificationType] = setTimeout(() => {
        timeoutHandles[notificationType] = undefined;
      }, 5 * 60 * 1000);

      let message = '';
      switch (notificationType) {
        case AudioNotificationType.YouAreMuted:
          message = $t('Unmute your Microphone source in Mixer');
          break;
        case AudioNotificationType.NoSignalFromAudioInput:
          message = $t('Your Microphone is unmuted but has no signal');
          break;
        default:
          console.warn('Unknown audio notification type:', notificationType);
          return;
      }

      const action = JsonrpcService.createRequest(
        Service.getResourceId(NotificationsService),
        'showNotifications',
      );

      NotificationsService.actions.push({
        type: ENotificationType.WARNING,
        message,
        action,
        singleton: true,
      });
    });

    return () => {
      subscription.unsubscribe();
      Object.values(timeoutHandles).forEach(v => clearTimeout(v));
    };
  }, []);

  // Track vertical orientation for placeholder
  useEffect(() => {
    let timeout: number;

    if (displayEnabled || performanceMode) return;

    function checkVerticalOrientation() {
      if (placeholderRef.current) {
        const { clientWidth, clientHeight } = placeholderRef.current;
        setVerticalPlaceholder(clientWidth / clientHeight < 16 / 9);
      }

      timeout = window.setTimeout(checkVerticalOrientation, 1000);
    }

    checkVerticalOrientation();

    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [displayEnabled, performanceMode]);

  // Track orientation for studio mode
  useEffect(() => {
    if (!v.studioMode) return;

    let timeout: number;

    function checkStudioModeOrientation() {
      if (studioModeRef.current) {
        const { clientWidth, clientHeight } = studioModeRef.current;
        setStudioModeStacked(clientWidth / clientHeight < 16 / 9);
      }

      timeout = window.setTimeout(checkStudioModeOrientation, 1000);
    }

    checkStudioModeOrientation();

    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [v.studioMode]);

  // This is a bit weird, but it's a performance optimization.
  // This component heavily re-renders, so trying to do as little
  // as possible on each re-render, including defining event handlers,
  // which in this case don't rely on the closure and therefore never
  // need to be redefined. It also ensures a single closure that never
  // changes for the moveInFlight piece of the mouseMove handler.
  const eventHandlers = useMemo(() => {
    function getMouseEvent(event: React.MouseEvent, display: TDisplayType) {
      return {
        offsetX: event.nativeEvent.offsetX,
        offsetY: event.nativeEvent.offsetY,
        pageX: event.pageX,
        pageY: event.pageY,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        metaKey: event.metaKey,
        button: event.button,
        buttons: event.buttons,
        display,
      };
    }

    let moveInFlight = false;
    let lastMoveEvent: React.MouseEvent | null = null;

    function onMouseMove(event: React.MouseEvent, display: TDisplayType) {
      if (moveInFlight) {
        lastMoveEvent = event;
        return;
      }

      moveInFlight = true;
      EditorService.actions.return.handleMouseMove(getMouseEvent(event, display)).then(stopMove => {
        if (stopMove && !messageActive) {
          showOutOfBoundsErrorMessage();
        }
        moveInFlight = false;

        if (lastMoveEvent) {
          onMouseMove(lastMoveEvent, display);
          lastMoveEvent = null;
        }
      });
    }

    return {
      onOutputResize(rect: IRectangle, display: TDisplayType) {
        EditorService.actions.handleOutputResize(rect, display);
      },

      onMouseDown(event: React.MouseEvent, display: TDisplayType) {
        EditorService.actions.handleMouseDown(getMouseEvent(event, display));
      },

      onMouseUp(event: React.MouseEvent, display: TDisplayType) {
        EditorService.actions.handleMouseUp(getMouseEvent(event, display));
      },

      onMouseEnter(event: React.MouseEvent, display: TDisplayType) {
        EditorService.actions.handleMouseEnter(getMouseEvent(event, display));
      },

      onMouseDblClick(event: React.MouseEvent, display: TDisplayType) {
        EditorService.actions.handleMouseDblClick(getMouseEvent(event, display));
      },

      onMouseMove,

      enablePreview() {
        CustomizationService.actions.setSettings({ performanceMode: false });
      },

      onContextMenu(event: React.MouseEvent) {
        event.stopPropagation();
      },
    };
  }, []);

  /**
   * Show error message in dual output mode when the user
   * attempts to drag a source out of the display.
   * Prevent continual calls using the messageActive state variable.
   */
  function showOutOfBoundsErrorMessage() {
    setMessageActive(true);
    message.error({
      content: $t('Cannot move source outside canvas in Dual Output Mode.'),
      duration: 2,
      className: styles.toggleError,
    });

    setTimeout(() => setMessageActive(false), 2000);
  }

  return (
    <div className={styles.mainContainer} ref={studioModeRef}>
      {displayEnabled && (
        <div className={cx(styles.studioModeContainer, { [styles.stacked]: studioModeStacked })}>
          {v.studioMode && <StudioModeControls stacked={studioModeStacked} />}
          {v.dualOutputMode && (
            <DualOutputControls stacked={studioModeStacked} isRecording={v.isRecording} />
          )}
          <div
            className={cx(styles.studioDisplayContainer, { [styles.stacked]: studioModeStacked })}
          >
            {v.showHorizontalDisplay && (
              <div
                className={cx(styles.studioEditorDisplayContainer, 'noselect')}
                style={{ cursor: v.cursor }}
                onMouseDown={(event: React.MouseEvent) =>
                  eventHandlers.onMouseDown(event, 'horizontal')
                }
                onMouseUp={(event: React.MouseEvent) =>
                  eventHandlers.onMouseUp(event, 'horizontal')
                }
                onMouseEnter={(event: React.MouseEvent) =>
                  eventHandlers.onMouseEnter(event, 'horizontal')
                }
                onMouseMove={(event: React.MouseEvent) =>
                  eventHandlers.onMouseMove(event, 'horizontal')
                }
                onDoubleClick={(event: React.MouseEvent) =>
                  eventHandlers.onMouseDblClick(event, 'horizontal')
                }
                onContextMenu={eventHandlers.onContextMenu}
              >
                <Display
                  id="horizontal-display"
                  type="horizontal"
                  drawUI={true}
                  paddingSize={10}
                  onOutputResize={(rect: IRectangle) =>
                    eventHandlers.onOutputResize(rect, 'horizontal')
                  }
                  renderingMode={ERenderingMode.OBS_MAIN_RENDERING}
                  sourceId={sourceId}
                />
              </div>
            )}
            {v.showVerticalDisplay && (
              <div
                className={cx(styles.studioEditorDisplayContainer, 'noselect')}
                style={{ cursor: v.cursor }}
                onMouseDown={(event: React.MouseEvent) =>
                  eventHandlers.onMouseDown(event, 'vertical')
                }
                onMouseUp={(event: React.MouseEvent) => eventHandlers.onMouseUp(event, 'vertical')}
                onMouseEnter={(event: React.MouseEvent) =>
                  eventHandlers.onMouseEnter(event, 'vertical')
                }
                onMouseMove={(event: React.MouseEvent) =>
                  eventHandlers.onMouseMove(event, 'vertical')
                }
                onDoubleClick={(event: React.MouseEvent) =>
                  eventHandlers.onMouseDblClick(event, 'vertical')
                }
                onContextMenu={eventHandlers.onContextMenu}
              >
                <Display
                  id="vertical-display"
                  type="vertical"
                  drawUI={true}
                  paddingSize={10}
                  onOutputResize={(rect: IRectangle) =>
                    eventHandlers.onOutputResize(rect, 'vertical')
                  }
                  renderingMode={ERenderingMode.OBS_MAIN_RENDERING}
                  sourceId={sourceId}
                />
              </div>
            )}
            {v.showHorizontalDisplay && !v.showVerticalDisplay && v.studioMode && (
              <div id="horizontal-display-studio" className={styles.studioModeDisplayContainer}>
                <Display paddingSize={10} type="horizontal" />
              </div>
            )}
            {!v.showHorizontalDisplay && v.showVerticalDisplay && v.studioMode && (
              <div id="vertical-display-studio" className={styles.studioModeDisplayContainer}>
                <Display paddingSize={10} type="vertical" />
              </div>
            )}
          </div>
        </div>
      )}
      {v.isLoading && <DualOutputProgressBar sceneId={v.activeSceneId} />}
      {!displayEnabled && (
        <div className={styles.noPreview}>
          {performanceMode && (
            <div className={styles.message}>
              {$t('Preview is disabled in performance mode')}
              <div
                className={cx('button button--action', styles.button)}
                onClick={eventHandlers.enablePreview}
              >
                {$t('Disable Performance Mode')}
              </div>
            </div>
          )}
          {!performanceMode && (
            <div className={styles.placeholder} ref={placeholderRef}>
              {v.studioMode && (
                <div
                  className={cx(styles.placeholderControls, {
                    [styles.stacked]: studioModeStacked,
                  })}
                />
              )}
              <img
                src={require('../../../media/images/16x9.png')}
                className={cx({
                  [styles.vertical]: verticalPlaceholder,
                  [styles.stacked]: studioModeStacked,
                  [styles.studioMode]: v.studioMode,
                })}
              />
              {v.studioMode && (
                <img
                  src={require('../../../media/images/16x9.png')}
                  className={cx(
                    { [styles.vertical]: verticalPlaceholder, [styles.stacked]: studioModeStacked },
                    styles.right,
                    styles.studioMode,
                  )}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StudioModeControls(p: { stacked: boolean }) {
  const { TransitionsService } = Services;

  return (
    <div className={cx(styles.studioModeControls, { [styles.stacked]: p.stacked })}>
      <span className={styles.studioModeControl}>{$t('Edit')}</span>
      <button
        className="button button--default"
        onClick={() => TransitionsService.actions.executeStudioModeTransition()}
      >
        {$t('Transition')}{' '}
        {p.stacked ? (
          <i className="fa fa-arrow-down" v-if="stacked" />
        ) : (
          <i className="fa fa-arrow-right" />
        )}
      </button>
      <span className={styles.studioModeControl}>{$t('Live')}</span>
    </div>
  );
}

function DualOutputControls(p: { stacked: boolean; isRecording: boolean }) {
  function openSettingsWindow() {
    Services.SettingsService.actions.showSettings('Video');
  }

  const showHorizontal = Services.DualOutputService.views.showHorizontalDisplay;
  const showVertical =
    Services.DualOutputService.views.showVerticalDisplay &&
    !Services.StreamingService.state.selectiveRecording;

  const showRecordingIcons = useMemo(() => {
    return (
      p.isRecording &&
      Services.IncrementalRolloutService.views.featureIsEnabled(
        EAvailableFeatures.dualOutputRecording,
      )
    );
  }, [p.isRecording]);

  return (
    <div
      id="dual-output-header"
      className={cx(styles.dualOutputHeader, { [styles.stacked]: p.stacked })}
    >
      {showHorizontal && (
        <div className={styles.horizontalHeader}>
          <i className="icon-desktop" />
          <span>{$t('Horizontal Output')}</span>
          {showRecordingIcons && <DualOutputIcons display="horizontal" />}
        </div>
      )}

      {showVertical && (
        <div className={styles.verticalHeader}>
          <i className="icon-phone-case" />
          <span>{$t('Vertical Output')}</span>
          {showRecordingIcons && <DualOutputIcons display="vertical" />}
        </div>
      )}
      <div className={styles.manageLink}>
        <a onClick={openSettingsWindow}>{$t('Manage Dual Output')}</a>
      </div>
    </div>
  );
}

/**
 * Note for the streaming and recording icons:
 * To maintain the horizontal and vertical header icon and text positioning centered,
 * conditionally change the opacity of the streaming and recording icons.
 * For the horizontal recording, to maintain the same margin of the streaming and recording icons
 * swap the icons shown conditionally so that when only recording, the recording icon shows next to
 * the header text.
 */
function DualOutputIcons(p: { display: TDisplayType }) {
  const { StreamingService } = Services;

  const { showStreaming, showRecording } = useVuex(() => ({
    showStreaming:
      (p.display === 'horizontal' && StreamingService.views.isHorizontalStreaming) ||
      (p.display === 'vertical' && StreamingService.views.isVerticalStreaming),
    showRecording:
      (p.display === 'horizontal' && StreamingService.views.isHorizontalRecording) ||
      (p.display === 'vertical' && StreamingService.views.isVerticalRecording),
  }));

  return (
    <>
      <i className={cx('icon-studio', styles.streamIcon, { [styles.hidden]: !showStreaming })} />
      <i className={cx('icon-record', styles.recordIcon, { [styles.hidden]: !showRecording })} />
    </>
  );
}

function DualOutputProgressBar(p: { sceneId: string }) {
  const { DualOutputService, ScenesService } = Services;

  const [current, setCurrent] = useState(0);

  const v = useVuex(() => ({
    total: ScenesService.views.getSceneNodesBySceneId(p.sceneId)?.length ?? 1,
  }));

  useSubscription(DualOutputService.sceneNodeHandled, index => setCurrent(index));

  return (
    <div className={styles.progressBar}>
      <AutoProgressBar percent={(current / v.total) * 100} timeTarget={10 * 1000} />
      <p>{$t('Loading scene...')}</p>
    </div>
  );
}
