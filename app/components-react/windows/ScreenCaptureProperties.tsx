import React, { useMemo, useState, useEffect } from 'react';
import electron from 'electron';
import { Services } from 'components-react/service-provider';
import styles from './ScreenCaptureProperties.m.less';
import { ModalLayout } from 'components-react/shared/ModalLayout';
import Display from 'components-react/shared/Display';
import cx from 'classnames';
import { $t } from 'services/i18n';
import { Modal, Button, Form, Tooltip } from 'antd';
import { CheckboxInput } from 'components-react/shared/inputs';
import { Source } from 'services/sources';
import * as remote from '@electron/remote';
import { useChildWindowParams } from 'components-react/hooks';

interface ICapturableOption {
  description: string;
  value: string;
  thumbnail?: string;
  icon?: string;
  type: 'game' | 'window' | 'screen';
}

/**
 * API for the useCaptureSource hook
 */
interface ICaptureSourceApi {
  selectedOption: string;
  setSelectedOption: (val: string) => void;
  options: ICapturableOption[];
  captureCursor: boolean;
  setCaptureCursor: (val: boolean) => void;
}

/**
 * Used for interacting with a capture source
 * @param sourceId The id of the source to manager
 * @example
 * const [captureOption, setCaptureOption, allCaptureOptions] = useCaptureSource(sourceId);
 */
function useCaptureSource(sourceId: string): ICaptureSourceApi {
  const { SourcesService, EditorCommandsService } = Services;
  const source = SourcesService.views.getSource(sourceId)!;
  const settings = useMemo(() => source.getSettings(), []);
  const [options, setOptions] = useState<ICapturableOption[]>([]);
  const [selectedOption, setSelectedOption] = useState<string>(settings['capture_source_list']);
  const [captureCursor, setCaptureCursor] = useState<boolean>(settings['capture_cursor'] ?? true);

  function buildSetter<TVal>(
    source: Source,
    field: string,
    stateSetter: (val: TVal) => void,
  ): (val: TVal) => void {
    return (val: TVal) => {
      stateSetter(val);
      EditorCommandsService.actions.executeCommand('EditSourceSettingsCommand', source.sourceId, {
        [field]: val,
      });
    };
  }

  useEffect(() => {
    (async () => {
      const windows: Electron.DesktopCapturerSource[] = await electron.ipcRenderer.invoke(
        'DESKTOP_CAPTURER_GET_SOURCES',
        {
          types: ['window'],
          fetchWindowIcons: true,
        },
      );
      const windowOptions = windows.map(win => {
        const opt: ICapturableOption = {
          description: win.name,
          value: win.id,
          thumbnail: win.thumbnail.toDataURL(),
          icon: win.appIcon?.toDataURL(),
          type: 'window',
        };

        return opt;
      });

      // Attempt to get thumbnails for screens
      const screenData: Electron.DesktopCapturerSource[] = await electron.ipcRenderer.invoke(
        'DESKTOP_CAPTURER_GET_SOURCES',
        { types: ['screen'] },
      );

      const screenOptions = remote.screen.getAllDisplays().map((screen, index) => {
        const opt: ICapturableOption = {
          description: `Screen ${index + 1}`,
          value: `monitor:${index}`,
          thumbnail: screenData
            .find(s => s.display_id === screen.id.toString())
            ?.thumbnail?.toDataURL(),
          type: 'screen',
        };

        return opt;
      });

      const gameOptions: ICapturableOption[] = [
        {
          description: $t('Automatic'),
          value: 'game:1',
          type: 'game',
        },
      ];

      setOptions([...gameOptions, ...screenOptions, ...windowOptions]);
    })();
  }, []);

  return {
    selectedOption,
    setSelectedOption: buildSetter(source, 'capture_source_list', setSelectedOption),
    options,
    captureCursor,
    setCaptureCursor: buildSetter(source, 'capture_cursor', setCaptureCursor),
  };
}

export default function ScreenCaptureProperties() {
  const { WindowsService } = Services;
  const sourceId = useChildWindowParams('sourceId');
  const sourceApi = useCaptureSource(sourceId);
  const [modal, setModal] = useState(false);

  function renderThumbnail(opt: ICapturableOption) {
    if (opt.thumbnail) return <img src={opt.thumbnail} />;
    if (opt.type === 'game') {
      return <i className={cx('fas fa-gamepad', styles.captureItemThumbnailIcon)} />;
    }

    return <i className={cx('fas fa-desktop', styles.captureItemThumbnailIcon)} />;
  }

  function renderCaptureOption(opt: ICapturableOption) {
    return (
      <div
        className={cx(styles.captureItem, {
          [styles.captureItemSelected]: sourceApi.selectedOption === opt.value,
        })}
        key={opt.value}
        onClick={() => sourceApi.setSelectedOption(opt.value)}
      >
        {renderThumbnail(opt)}
        <div className={styles.captureItemThumbnailOverlay} />
        <div className={styles.captureItemText}>
          {opt.type === 'screen' && <i className="fas fa-desktop" style={{ marginRight: 8 }} />}
          {opt.type === 'game' && <i className="fas fa-gamepad" style={{ marginRight: 8 }} />}
          {opt.type === 'window' && <img src={opt.icon} />}
          <span className={styles.captureItemDescription}>{opt.description}</span>
          {opt.value === 'game:1' && (
            <Tooltip
              title={$t(
                'Automatic game capture will scan for running games and automatically capture them.',
              )}
            >
              <i className="fas fa-question-circle" style={{ marginLeft: 8 }} />
            </Tooltip>
          )}
        </div>
      </div>
    );
  }

  function renderFooter() {
    return (
      <>
        <span className={styles.additionalSettings} onClick={() => setModal(true)}>
          {$t('Show Additional Settings')}
        </span>
        <Button type="primary" onClick={() => WindowsService.actions.closeChildWindow()}>
          {$t('Done')}
        </Button>
      </>
    );
  }

  return (
    <ModalLayout
      scrollable
      fixedChild={modal ? <div /> : <Display sourceId={sourceId} />}
      footer={renderFooter()}
    >
      <div>
        {sourceApi.options.length === 0 && (
          <div className={styles.captureListLoading}>
            <i className="fa fa-spinner fa-pulse" />
          </div>
        )}
        {sourceApi.options.length > 0 && (
          <>
            <h2>{$t('Capture Game')}</h2>
            <div className={styles.captureList}>
              {sourceApi.options.filter(opt => opt.type === 'game').map(renderCaptureOption)}
            </div>
            <h2>{$t('Capture Entire Screen')}</h2>
            <div className={styles.captureList}>
              {sourceApi.options.filter(opt => opt.type === 'screen').map(renderCaptureOption)}
            </div>
            <h2>{$t('Capture Window')}</h2>
            <div className={styles.captureList}>
              {sourceApi.options.filter(opt => opt.type === 'window').map(renderCaptureOption)}
            </div>
          </>
        )}
      </div>
      <Modal footer={null} visible={modal} onCancel={() => setModal(false)} getContainer={false}>
        <h2>Additional Settings</h2>
        <Form>
          <CheckboxInput
            label={$t('Capture Cursor')}
            value={sourceApi.captureCursor}
            onChange={sourceApi.setCaptureCursor}
          />
        </Form>
      </Modal>
    </ModalLayout>
  );
}
