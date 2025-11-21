import { Services } from '../service-provider';
import { promptAction } from 'components-react/modals';
import { $t } from 'services/i18n/i18n';

export async function confirmStreamShift() {
  const { RestreamService, DualOutputService } = Services;
  const { streamShiftForceGoLive } = RestreamService.state;
  let shouldForceGoLive = streamShiftForceGoLive;

  const message = DualOutputService.state.dualOutputMode
    ? $t(
        'A stream on another device has been detected. Would you like to switch your stream to Streamlabs Desktop? If you do not wish to continue this stream, please end it from the current streaming source. Dual Output will be disabled since not supported in this mode. If you\'re sure you\'re not live and it has been incorrectly detected, choose "Force Start" below.',
      )
    : $t(
        'A stream on another device has been detected. Would you like to switch your stream to Streamlabs Desktop? If you do not wish to continue this stream, please end it from the current streaming source. If you\'re sure you\'re not live and it has been incorrectly detected, choose "Force Start" below.',
      );

  await promptAction({
    title: $t('Another stream detected'),
    message,
    btnText: $t('Switch to Streamlabs Desktop'),
    fn: () => {
      RestreamService.actions.startStreamShift();
      shouldForceGoLive = false;
    },
    cancelBtnText: $t('Cancel'),
    cancelBtnPosition: 'left',
    secondaryActionText: $t('Force Start'),
    secondaryActionFn: async () => {
      // FIXME: this should actually do something server-side
      RestreamService.actions.return.forceStreamShiftGoLive(true);
      shouldForceGoLive = true;
    },
  });

  return shouldForceGoLive;
}
