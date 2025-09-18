import React, { CSSProperties } from 'react';
import { Button, Modal } from 'antd';
import styles from './AuthModal.m.less';
import { $t } from 'services/i18n';
import { Services } from 'components-react/service-provider';
import cx from 'classnames';
import { useVuex } from 'components-react/hooks';
import { getDefined } from 'util/properties-type-guards';
import { useGoLiveSettingsRoot } from 'components-react/windows/go-live/useGoLiveSettings';
import Form from './inputs/Form';
import { createBinding, SwitchInput } from './inputs';
import { ITwitchStartStreamOptions } from 'services/platforms/twitch';
import GameSelector from 'components-react/windows/go-live/GameSelector';
import AiHighlighterToggle from 'components-react/windows/go-live/AiHighlighterToggle';

interface AuthModalProps {
  showModal: boolean;
  handleShowModal: (status: boolean) => void;
  className?: string;
  style?: CSSProperties;
}

export function CloudShiftModal(p: AuthModalProps) {
  const { StreamingService, DualOutputService } = Services;

  const { useAiHighlighter } = useVuex(() => ({
    useAiHighlighter: Services.HighlighterService.views.useAiHighlighter,
  }));

  const message = Services.DualOutputService.views.dualOutputMode
    ? $t(
        'A stream on another device has been detected. Would you like to switch your stream to Streamlabs Desktop? If you do not wish to continue this stream, please end it from the current streaming source.',
      ) + $t('Dual Output will be disabled since not supported in this mode.')
    : $t(
        'A stream on another device has been detected. Would you like to switch your stream to Streamlabs Desktop? If you do not wish to continue this stream, please end it from the current streaming source.',
      );

  function handleCloudShift() {
    if (DualOutputService.views.dualOutputMode) {
      Services.DualOutputService.actions.toggleDisplay(false, 'vertical');
    }

    StreamingService.actions.goLive();

    Services.WindowsService.actions.updateStyleBlockers('main', false);
    p.handleShowModal(false);
  }

  return (
    <Modal
      footer={
        <div className={styles.buttons}>
          <Button onClick={() => p.handleShowModal(false)}>{$t('Cancel')}</Button>
          <Button onClick={handleCloudShift} type="primary">
            {$t('Switch to Streamlabs Desktop')}
          </Button>
        </div>
      }
      visible={p.showModal}
      onCancel={() => p.handleShowModal(false)}
      getContainer={false}
      className={cx(styles.cloudShiftWrapper, p?.className)}
    >
      <div className={styles.cloudShiftModal}>
        <h2>{$t('Another stream detected')}</h2>
        <div>{message}</div>

        {useAiHighlighter && <HighlighterForm />}
      </div>
    </Modal>
  );
}

function HighlighterForm() {
  const { form, settings, updatePlatform } = useGoLiveSettingsRoot();

  const twSettings = getDefined(settings.platforms['twitch']);
  function updateSettings(patch: Partial<ITwitchStartStreamOptions>) {
    updatePlatform('twitch', { ...twSettings, ...patch });
  }

  const { useAiHighlighter } = useVuex(() => ({
    useAiHighlighter: Services.HighlighterService.views.useAiHighlighter,
  }));

  const bind = createBinding(twSettings, updatedSettings => updateSettings(updatedSettings));

  return (
    <Form form={form!} id="cloud-shift-modal" style={{ paddingTop: '15px' }} layout="vertical">
      <h2>{$t('AI Highlighter Settings')}</h2>
      {/* <GameSelector key="required" platform={'twitch'} {...bind.game} layout="vertical" />
      <AiHighlighterToggle key="ai-toggle" game={bind.game?.value} cardIsExpanded={false} /> */}

      <span>
        {$t(
          'AI Highlighter is enabled. Please confirm your game to use AI Highlighter, or toggle it off.',
        )}
      </span>
      <div>
        <SwitchInput
          style={{ width: '80px', margin: '10px 0' }}
          value={useAiHighlighter}
          label={$t('Toggle Highlighter')}
          labelAlign="right"
          layout="horizontal"
          color="secondary"
          onChange={Services.HighlighterService.actions.toggleAiHighlighter}
        />
        <GameSelector key="required" platform={'twitch'} {...bind.game} layout="vertical" />
      </div>
    </Form>
  );
}
