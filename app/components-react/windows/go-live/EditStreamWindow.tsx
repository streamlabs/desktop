import styles from './GoLive.m.less';
import { ModalLayout } from '../../shared/ModalLayout';
import { Button, Col, Row } from 'antd';
import { useOnCreate } from 'slap';
import { Services } from '../../service-provider';
import React, { useCallback, memo } from 'react';
import { $t } from '../../../services/i18n';
import GoLiveChecklist from './GoLiveChecklist';
import Form from '../../shared/inputs/Form';
import Animation from 'rc-animate';
import { useGoLiveSettings, useGoLiveSettingsRoot } from './useGoLiveSettings';
import PlatformSettings from './PlatformSettings';
import Scrollable from '../../shared/Scrollable';
import Spinner from '../../shared/Spinner';
import GoLiveError from './GoLiveError';
import PrimaryChatSwitcher from './PrimaryChatSwitcher';
import { DestinationSwitchers } from './DestinationSwitchers';
import cx from 'classnames';
import { CaretDownOutlined } from '@ant-design/icons';

export default function EditStreamWindow() {
  const { StreamingService } = Services;
  const {
    lifecycle,
    prepopulate,
    isLoading,
    form,
    enabledPlatforms,
    hasMultiplePlatforms,
    primaryChat,
    setPrimaryChat,
    isDualOutputMode,
    protectedModeEnabled,
  } = useGoLiveSettingsRoot({ isUpdateMode: true });

  const shouldShowChecklist = lifecycle === 'runChecklist';
  const shouldShowSettings = !shouldShowChecklist;

  const shouldShowLeftCol = isDualOutputMode ? true : protectedModeEnabled;

  useOnCreate(() => {
    // the streamingService still may keep a error from GoLive flow like a "Post a Tweet" error
    // reset error for allowing update channel info
    StreamingService.actions.resetError();
    prepopulate();
  });

  const shouldShowPrimaryChatSwitcher = hasMultiplePlatforms;

  return (
    <ModalLayout footer={<EditStreamFooter />} className={styles.goLive}>
      <Form
        form={form}
        style={{ position: 'relative', height: '100%' }}
        layout="horizontal"
        name="editStreamForm"
      >
        <Spinner visible={isLoading} />
        <Animation transitionName="fade" key="editStreamSettings">
          {/* STEP 1 - FILL OUT THE SETTINGS FORM */}
          {shouldShowSettings && (
            <Row gutter={16} className={styles.settingsRow} key={'platforms'}>
              {/*LEFT COLUMN*/}
              {shouldShowLeftCol && (
                <Col span={9} className={styles.leftColumn}>
                  <div className={cx(styles.columnHeader)}>
                    {$t('Update Destinations & Outputs:')}
                  </div>
                  <div className={cx(styles.columnContent, styles.updateMode)}>
                    <Scrollable className={styles.switcherWrapper}>
                      <DestinationSwitchers />
                    </Scrollable>
                  </div>
                  <div className={styles.leftFooter}>
                    <PrimaryChatSwitcher
                      className={cx(styles.primaryChat, {
                        [styles.disabled]: !shouldShowPrimaryChatSwitcher,
                      })}
                      enabledPlatforms={enabledPlatforms}
                      onSetPrimaryChat={setPrimaryChat}
                      primaryChat={primaryChat}
                      suffixIcon={<CaretDownOutlined />}
                      layout="horizontal"
                      logo={false}
                      border={false}
                      disabled={!shouldShowPrimaryChatSwitcher}
                      tooltip={
                        !shouldShowPrimaryChatSwitcher
                          ? $t('Enable multiple platforms to set primary chat.')
                          : undefined
                      }
                    />
                  </div>
                </Col>
              )}
              <Col
                span={shouldShowLeftCol ? 15 : 24}
                className={cx(styles.rightColumn, !shouldShowLeftCol && styles.destinationMode)}
              >
                <Spinner visible={isLoading} />
                <Scrollable key={'settings'} style={{ height: '100%' }} snapToWindowEdge>
                  <GoLiveError />
                  <PlatformSettings />
                </Scrollable>
              </Col>
            </Row>
          )}

          {/* STEP 2 - RUN THE CHECKLIST */}
          {shouldShowChecklist && <GoLiveChecklist className={styles.page} key={'checklist'} />}
        </Animation>
      </Form>
    </ModalLayout>
  );
}

const EditStreamFooter = memo(function EditStreamFooter() {
  const { WindowsService, StreamingService } = Services;
  const { error, lifecycle, updateStream, isLoading } = useGoLiveSettings();

  const close = useCallback(() => {
    WindowsService.actions.closeChildWindow();
  }, []);

  const goBackToSettings = useCallback(() => {
    StreamingService.actions.showEditStream();
  }, []);

  const shouldShowUpdateButton = lifecycle !== 'runChecklist';
  const shouldShowGoBackButton = !shouldShowUpdateButton && error;

  return (
    <Form layout={'inline'}>
      {/* CLOSE BUTTON */}
      <Button onClick={close}>{$t('Close')}</Button>

      {/* GO BACK BUTTON */}
      {shouldShowGoBackButton && (
        <Button onClick={goBackToSettings}>{$t('Go back to settings')}</Button>
      )}

      {/* UPDATE BUTTON */}
      {shouldShowUpdateButton && (
        <Button type="primary" onClick={updateStream} disabled={isLoading}>
          {$t('Update')}
        </Button>
      )}
    </Form>
  );
});
