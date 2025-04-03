import React from 'react';
import { useOnCreate } from 'slap';
import { ModalLayout } from '../../shared/ModalLayout';
import { Services } from '../../service-provider';
import { AlertBox } from '../AlertBox';
import { AlertBoxModule } from '../useAlertBox';
import { useWidgetRoot, WidgetModule } from './useWidget';
// TODO: import other widgets here to avoid merge conflicts
// BitGoal
// DonationGoal
// CharityGoal
// FollowerGoal
// StarsGoal
// SubGoal
// SubscriberGoal
import { ChatBox, ChatBoxModule } from '../ChatBox';
// ChatHighlight
// Credits
import { DonationTicker, DonationTickerModule } from '../DonationTicker';
import { EmoteWall, EmoteWallModule } from '../EmoteWall';
// EventList
// MediaShare
// Poll
// SpinWheel
// SponsorBanner
// StreamBoss
// TipJar
import { GameWidget, GameWidgetModule } from '../GameWidget';
import { ViewerCount, ViewerCountModule } from '../ViewerCount';
import { CustomWidget, CustomWidgetModule } from '../CustomWidget';
import { useSubscription } from '../../hooks/useSubscription';
import { useChildWindowParams } from 'components-react/hooks';

// define list of Widget components and modules
export const components = {
  AlertBox: [AlertBox, AlertBoxModule],
  // BitGoal
  // DonationGoal
  // CharityGoal
  // FollowerGoal
  // StarsGoal
  // SubGoal
  // SubscriberGoal
  ChatBox: [ChatBox, ChatBoxModule],
  // ChatHighlight
  // Credits
  DonationTicker: [DonationTicker, DonationTickerModule],
  EmoteWall: [EmoteWall, EmoteWallModule],
  // EventList
  // MediaShare
  // Poll
  // SpinWheel
  // SponsorBanner
  // StreamBoss
  // TipJar
  ViewerCount: [ViewerCount, ViewerCountModule],
  GameWidget: [GameWidget, GameWidgetModule],
  CustomWidget: [CustomWidget, CustomWidgetModule],
};

/**
 * Renders a widget window by given sourceId from window's query params
 */
export function WidgetWindow() {
  const { WidgetsService } = Services;
  const { sourceId, widgetType } = useChildWindowParams();

  // take the source id and widget's component from the window's params
  const { Module, WidgetSettingsComponent } = useOnCreate(() => {
    const [WidgetSettingsComponent, Module] = components[widgetType];
    return { sourceId, Module, WidgetSettingsComponent };
  });

  // initialize the Redux module for the widget
  // so all children components can use it via `useWidget()` call
  const { reload } = useWidgetRoot(Module as typeof WidgetModule, { sourceId });

  useSubscription(WidgetsService.settingsInvalidated, reload);

  return (
    <ModalLayout bodyStyle={{ padding: '0px' }} hideFooter={true}>
      <WidgetSettingsComponent />
    </ModalLayout>
  );
}
