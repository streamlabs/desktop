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
import { DisplayToggle } from 'components-react/shared/DisplayToggle';

export default function StudioEditor() {
  const {
    WindowsService,
    CustomizationService,
    EditorService,
    TransitionsService,
    ScenesService,
    DualOutputService,
    StreamingService,
  } = Services;
  const performanceMode = useRealmObject(CustomizationService.state).performanceMode;
  const v = useVuex(() => ({
    hideStyleBlockers: WindowsService.state.main.hideStyleBlockers,
    cursor: EditorService.state.cursor,
    studioMode: TransitionsService.state.studioMode,
    dualOutputMode: DualOutputService.views.dualOutputMode,
    showHorizontalDisplay: DualOutputService.views.showHorizontalDisplay,
    showVerticalDisplay:
      DualOutputService.views.showVerticalDisplay && !StreamingService.state.selectiveRecording,
    activeSceneId: ScenesService.views.activeSceneId,
    isLoading: DualOutputService.views.isLoading,
  }));

  const placeholderRef = useRef<HTMLDivElement>(null);
  const studioModeRef = useRef<HTMLDivElement>(null);
  const studioModeToggleRef = useRef<HTMLDivElement>(null);
  const [studioModeStacked, setStudioModeStacked] = useState(false);
  const [studioModeDisplay, setStudioModeDisplay] = useState<TDisplayType>('horizontal');
  const [verticalPlaceholder, setVerticalPlaceholder] = useState(false);
  const [messageActive, setMessageActive] = useState(false);

  const displayEnabled = useMemo(() => {
    return !v.hideStyleBlockers && !performanceMode && !v.isLoading;
  }, [v.hideStyleBlockers, performanceMode, v.isLoading]);

  const studioModeTransitionName = useMemo(() => TransitionsService.getStudioTransitionName(), [
    v.studioMode,
  ]);

  const sourceId = useMemo(() => {
    const dualOutputMode = v.showHorizontalDisplay && v.showVerticalDisplay;
    return v.studioMode && !dualOutputMode ? studioModeTransitionName : undefined;
  }, [v.showHorizontalDisplay, v.showVerticalDisplay, v.studioMode]);

  const showHorizontal = useMemo(() => {
    if (v.studioMode) {
      return studioModeDisplay === 'horizontal';
    }

    return v.showHorizontalDisplay;
  }, [v.showHorizontalDisplay, studioModeDisplay, v.studioMode]);

  const showVertical = useMemo(() => {
    if (v.studioMode) {
      return studioModeDisplay === 'vertical';
    }

    return v.showVerticalDisplay;
  }, [v.showVerticalDisplay, studioModeDisplay, v.studioMode]);

  const resizeObserver = new ResizeObserver((entries: ResizeObserverEntry[]) => {
    entries.forEach((entry: ResizeObserverEntry) => {
      if (!entry || !entry?.contentRect) return;

      const width = Math.floor(entry?.contentRect?.width);
      const height = Math.floor(entry?.contentRect?.height);

      if (displayEnabled || performanceMode) return;

      if (placeholderRef?.current) {
        setVerticalPlaceholder(width / height < 16 / 9);
      }

      if (studioModeRef?.current) {
        setStudioModeStacked(width / height < 16 / 9);
      }
    });
  });

  useEffect(() => {
    let mounted = true;
    if (placeholderRef && placeholderRef?.current) {
      resizeObserver.observe(placeholderRef?.current);
    }

    if (studioModeRef && studioModeRef?.current) {
      resizeObserver.observe(studioModeRef?.current);
    }

    return () => {
      if (!placeholderRef || !placeholderRef?.current) return;
      resizeObserver.unobserve(placeholderRef.current);

      if (!studioModeRef || !studioModeRef?.current) return;
      resizeObserver.unobserve(studioModeRef.current);

      mounted = false;
    };
  }, [placeholderRef, placeholderRef?.current, studioModeRef, studioModeRef?.current]);

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
          {v.studioMode && (
            <StudioModeControls
              stacked={studioModeStacked}
              studioModeDisplay={studioModeDisplay}
              setStudioModeDisplay={setStudioModeDisplay}
              ref={studioModeToggleRef}
            />
          )}
          {v.dualOutputMode && !v.studioMode && <DualOutputControls stacked={studioModeStacked} />}
          <div
            className={cx(styles.studioDisplayContainer, { [styles.stacked]: studioModeStacked })}
          >
            {showHorizontal && (
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
            {showVertical && (
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
            {v.studioMode && showHorizontal && (
              <div id="horizontal-display-studio" className={styles.studioModeDisplayContainer}>
                <Display paddingSize={10} type="horizontal" />
              </div>
            )}
            {v.studioMode && showVertical && (
              <div id="vertical-display-studio" className={styles.studioModeDisplayContainer}>
                <Display paddingSize={10} type="vertical" />
              </div>
            )}
          </div>
        </div>
      )}
      {v.isLoading && <ProgressBar sceneId={v.activeSceneId} />}
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
                  [styles.studioMode]: v.studioMode || v.dualOutputMode,
                })}
              />
              {(v.studioMode || v.dualOutputMode) && (
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

interface IStudioModeControlsProps {
  stacked: boolean;
  studioModeDisplay: TDisplayType;
  setStudioModeDisplay: (display: TDisplayType) => void;
}

const StudioModeControls = React.forwardRef<{}, IStudioModeControlsProps>((p, ref) => {
  const { TransitionsService, DualOutputService } = Services;

  const placement = p.stacked ? 'bottomRight' : 'right';

  return (
    <div className={cx(styles.studioModeControls, { [styles.stacked]: p.stacked })}>
      <div className={styles.studioModeControl} style={{ width: '80px' }}>
        <span style={{ marginRight: '10px' }}>{$t('Edit')}</span>
        {DualOutputService.views.dualOutputMode && (
          <DisplayToggle
            className={styles.studioModeDisplayToggle}
            display={p.studioModeDisplay}
            setDisplay={p.setStudioModeDisplay}
            placement={placement}
            iconSize={14}
            ref={ref}
          />
        )}
      </div>
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
});

function DualOutputControls(p: { stacked: boolean }) {
  function openSettingsWindow() {
    Services.SettingsService.actions.showSettings('Video');
  }
  const showHorizontal = Services.DualOutputService.views.showHorizontalDisplay;
  const showVertical =
    Services.DualOutputService.views.showVerticalDisplay &&
    !Services.StreamingService.state.selectiveRecording;

  return (
    <div
      id="dual-output-header"
      className={cx(styles.dualOutputHeader, { [styles.stacked]: p.stacked })}
    >
      {showHorizontal && (
        <div className={styles.horizontalHeader}>
          <i className="icon-desktop" />
          <span>{$t('Horizontal Output')}</span>
        </div>
      )}

      {showVertical && (
        <div className={styles.verticalHeader}>
          <i className="icon-phone-case" />
          <span>{$t('Vertical Output')}</span>
        </div>
      )}
      <div className={styles.manageLink}>
        <a onClick={openSettingsWindow}>{$t('Manage Dual Output')}</a>
      </div>
    </div>
  );
}

function ProgressBar(p: { sceneId: string }) {
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
